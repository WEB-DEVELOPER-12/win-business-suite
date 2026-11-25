"use strict";

const session = require("express-session");

const DEFAULT_SESSION_TTL_MS = 8 * 60 * 60 * 1000;
const DEFAULT_CLEANUP_INTERVAL_MS = 15 * 60 * 1000;

class SQLiteSessionStore extends session.Store {
    constructor(options = {}) {
        super();

        if (!options.db || typeof options.db.run !== "function") {
            throw new TypeError("An existing SQLite database connection is required.");
        }

        this.db = options.db;
        this.tableName = options.tableName || "win_sessions";
        this.cleanupIntervalMs =
            options.cleanupIntervalMs || DEFAULT_CLEANUP_INTERVAL_MS;

        if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(this.tableName)) {
            throw new TypeError("Invalid SQLite session table name.");
        }

        this.ready = null;
        this.cleanupTimer = null;
    }

    run(sql, parameters = []) {
        return new Promise((resolve, reject) => {
            this.db.run(sql, parameters, function (error) {
                if (error) return reject(error);

                resolve({
                    changes: this.changes,
                    lastID: this.lastID
                });
            });
        });
    }

    getRow(sql, parameters = []) {
        return new Promise((resolve, reject) => {
            this.db.get(sql, parameters, (error, row) => {
                if (error) return reject(error);
                resolve(row || null);
            });
        });
    }

    initialize() {
        if (this.ready) return this.ready;

        this.ready = (async () => {
            await this.run(`
                CREATE TABLE IF NOT EXISTS "${this.tableName}" (
                    sid TEXT PRIMARY KEY,
                    sess TEXT NOT NULL,
                    expires_at INTEGER NOT NULL
                )
            `);

            await this.run(`
                CREATE INDEX IF NOT EXISTS idx_win_sessions_expires
                ON "${this.tableName}" (expires_at)
            `);

            await this.removeExpiredSessions();
            this.startCleanup();
        })();

        return this.ready;
    }

    getExpiration(sessionData) {
        const cookie = sessionData?.cookie || {};
        let expiresAt;

        if (cookie.expires) {
            expiresAt = new Date(cookie.expires).getTime();
        } else if (typeof cookie.maxAge === "number") {
            if (!Number.isFinite(cookie.maxAge) || cookie.maxAge <= 0) {
                throw new Error("Invalid session lifetime.");
            }

            expiresAt = Date.now() + cookie.maxAge;
        } else {
            expiresAt = Date.now() + DEFAULT_SESSION_TTL_MS;
        }

        if (!Number.isFinite(expiresAt) || expiresAt <= Date.now()) {
            throw new Error("Invalid or expired session.");
        }

        return Math.floor(expiresAt);
    }

    afterReady(operation, callback) {
        const task = this.ready
            ? this.ready.then(operation)
            : Promise.reject(
                new Error("SQLite session store has not been initialized.")
            );

        if (typeof callback === "function") {
            task.then(
                result => callback(null, result),
                error => callback(error)
            );
        }
    }

    get(sid, callback) {
        this.afterReady(async () => {
            const row = await this.getRow(
                `SELECT sess, expires_at
                 FROM "${this.tableName}"
                 WHERE sid = ?`,
                [sid]
            );

            if (!row) return null;

            if (row.expires_at <= Date.now()) {
                await this.run(
                    `DELETE FROM "${this.tableName}" WHERE sid = ?`,
                    [sid]
                );

                return null;
            }

            try {
                return JSON.parse(row.sess);
            } catch {
                await this.run(
                    `DELETE FROM "${this.tableName}" WHERE sid = ?`,
                    [sid]
                );

                return null;
            }
        }, callback);
    }

    set(sid, sessionData, callback) {
        this.afterReady(async () => {
            const serialized = JSON.stringify(sessionData);

            if (typeof serialized !== "string") {
                throw new Error("Session data could not be serialized.");
            }

            const expiresAt = this.getExpiration(sessionData);

            await this.run(
                `INSERT INTO "${this.tableName}" (sid, sess, expires_at)
                 VALUES (?, ?, ?)
                 ON CONFLICT(sid) DO UPDATE SET
                    sess = excluded.sess,
                    expires_at = excluded.expires_at`,
                [sid, serialized, expiresAt]
            );
        }, callback);
    }

    touch(sid, sessionData, callback) {
        this.afterReady(async () => {
            const serialized = JSON.stringify(sessionData);

            if (typeof serialized !== "string") {
                throw new Error("Session data could not be serialized.");
            }

            const expiresAt = this.getExpiration(sessionData);

            await this.run(
                `UPDATE "${this.tableName}"
                 SET sess = ?, expires_at = ?
                 WHERE sid = ?`,
                [serialized, expiresAt, sid]
            );
        }, callback);
    }

    destroy(sid, callback) {
        this.afterReady(async () => {
            await this.run(
                `DELETE FROM "${this.tableName}" WHERE sid = ?`,
                [sid]
            );
        }, callback);
    }

    async removeExpiredSessions() {
        await this.run(
            `DELETE FROM "${this.tableName}" WHERE expires_at <= ?`,
            [Date.now()]
        );
    }

    startCleanup() {
        if (this.cleanupTimer) return;

        this.cleanupTimer = setInterval(() => {
            this.removeExpiredSessions().catch(error => {
                console.error("WIN session cleanup failed:", error.message);
            });
        }, this.cleanupIntervalMs);

        if (typeof this.cleanupTimer.unref === "function") {
            this.cleanupTimer.unref();
        }
    }

    close() {
        if (this.cleanupTimer) {
            clearInterval(this.cleanupTimer);
            this.cleanupTimer = null;
        }
    }
}

module.exports = SQLiteSessionStore;