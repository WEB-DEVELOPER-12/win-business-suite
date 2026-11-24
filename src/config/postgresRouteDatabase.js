
"use strict";

const { AsyncLocalStorage } = require("async_hooks");
const pool = require("./postgresDatabase");

const requestContext = new AsyncLocalStorage();

function convertPlaceholders(sql) {
    let index = 0;
    return sql.replace(/\?/g, () => `$${++index}`);
}

function normalizeSql(sql) {
    let result = sql.trim();

    result = result.replace(
        /^BEGIN\s+IMMEDIATE(?:\s+TRANSACTION)?$/i,
        "BEGIN"
    );

    result = result.replace(/^BEGIN\s+TRANSACTION$/i, "BEGIN");

    return convertPlaceholders(result);
}

function getState() {
    const state = requestContext.getStore();

    if (!state) {
        throw new Error("No PostgreSQL request connection is available.");
    }

    return state;
}

function finishConnection(state) {
    if (
        state.released ||
        state.releasing ||
        !state.releaseRequested ||
        state.pending > 0
    ) {
        return;
    }

    state.releasing = true;

    const release = error => {
        if (state.released) return;

        state.released = true;
        state.releasing = false;
        state.client.release(error);
    };

    if (state.transactionOpen) {
        state.client.query("ROLLBACK")
            .then(() => {
                state.transactionOpen = false;
                release();
            })
            .catch(error => {
                console.error(
                    "PostgreSQL automatic rollback failed:",
                    error.message
                );
                release(error);
            });

        return;
    }

    release();
}

function createState(client) {
    return {
        client,
        pending: 0,
        transactionOpen: false,
        releaseRequested: false,
        releasing: false,
        released: false
    };
}

function middleware(req, res, next) {
    pool.connect()
        .then(client => {
            const state = createState(client);

            const requestFinished = () => {
                state.releaseRequested = true;
                finishConnection(state);
            };

            res.once("finish", requestFinished);
            res.once("close", requestFinished);

            requestContext.run(state, next);
        })
        .catch(error => {
            console.error(
                "PostgreSQL request connection error:",
                error.message
            );

            if (!res.headersSent) {
                res.status(503).json({
                    success: false,
                    message: "Database connection is temporarily unavailable."
                });
            }
        });
}

/*
 * Runs a background task on one dedicated PostgreSQL client.
 * All db.run/get/all/query calls inside the callback share this client.
 */
async function withConnection(callback) {
    let existingState = null;

    try {
        existingState = getState();
    } catch {
        // A background task has no existing request connection.
    }

    if (existingState) {
        return callback();
    }

    const client = await pool.connect();
    const state = createState(client);

    return requestContext.run(state, async () => {
        let releaseError = null;

        try {
            return await callback();
        } catch (error) {
            if (state.transactionOpen) {
                try {
                    await client.query("ROLLBACK");
                    state.transactionOpen = false;
                } catch (rollbackError) {
                    releaseError = rollbackError;
                    console.error(
                        "Background PostgreSQL rollback failed:",
                        rollbackError.message
                    );
                }
            }

            throw error;
        } finally {
            if (state.transactionOpen && !releaseError) {
                try {
                    await client.query("ROLLBACK");
                    state.transactionOpen = false;
                } catch (rollbackError) {
                    releaseError = rollbackError;
                    console.error(
                        "Background PostgreSQL cleanup rollback failed:",
                        rollbackError.message
                    );
                }
            }

            client.release(releaseError);
            state.released = true;
        }
    });
}

function execute(sql, params, callback, mode) {
    let state;

    try {
        state = getState();
    } catch (error) {
        callback(error);
        return;
    }

    const statement = normalizeSql(sql);

    const transactionCommand =
        /^(BEGIN|COMMIT|ROLLBACK)\b/i
            .exec(statement)?.[1]?.toUpperCase();

    if (
        state.released ||
        state.releasing ||
        (state.releaseRequested && state.pending === 0)
    ) {
        callback(new Error("The PostgreSQL request connection is closed."));
        return;
    }

    const isInsert = /^\s*INSERT\s+INTO\b/i.test(statement);

    const finalSql =
        mode === "run" &&
        isInsert &&
        !/\bRETURNING\b/i.test(statement)
            ? `${statement} RETURNING id`
            : statement;

    state.pending++;

    state.client.query(finalSql, params)
        .then(result => {
            if (transactionCommand === "BEGIN") {
                state.transactionOpen = true;
            } else if (
                transactionCommand === "COMMIT" ||
                transactionCommand === "ROLLBACK"
            ) {
                state.transactionOpen = false;
            }

            if (mode === "run") {
                callback.call({
                    lastID: result.rows?.[0]?.id ?? undefined,
                    changes: result.rowCount ?? 0
                }, null);
            } else if (mode === "get") {
                callback(null, result.rows[0]);
            } else {
                callback(null, result.rows || []);
            }
        })
        .catch(error => {
            if (mode === "run") {
                callback.call({
                    lastID: undefined,
                    changes: 0
                }, error);
            } else {
                callback(error);
            }
        })
        .finally(() => {
            state.pending--;
            finishConnection(state);
        });
}

function run(sql, params = [], callback) {
    if (typeof params === "function") {
        callback = params;
        params = [];
    }

    execute(sql, params, callback || (() => {}), "run");
}

function get(sql, params = [], callback) {
    if (typeof params === "function") {
        callback = params;
        params = [];
    }

    execute(sql, params, callback || (() => {}), "get");
}

function all(sql, params = [], callback) {
    if (typeof params === "function") {
        callback = params;
        params = [];
    }

    execute(sql, params, callback || (() => {}), "all");
}

async function query(sql, params = []) {
    let state;

    try {
        state = getState();
    } catch {
        return pool.query(normalizeSql(sql), params);
    }

    if (
        state.released ||
        state.releasing ||
        (state.releaseRequested && state.pending === 0)
    ) {
        throw new Error("The PostgreSQL request connection is closed.");
    }

    const statement = normalizeSql(sql);

    const transactionCommand =
        /^(BEGIN|COMMIT|ROLLBACK)\b/i
            .exec(statement)?.[1]?.toUpperCase();

    state.pending++;

    try {
        const result = await state.client.query(statement, params);

        if (transactionCommand === "BEGIN") {
            state.transactionOpen = true;
        } else if (
            transactionCommand === "COMMIT" ||
            transactionCommand === "ROLLBACK"
        ) {
            state.transactionOpen = false;
        }

        return result;
    } finally {
        state.pending--;
        finishConnection(state);
    }
}

module.exports = {
    middleware,
    run,
    get,
    all,
    query,
    withConnection
};
