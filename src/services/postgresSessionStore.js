
const session = require("express-session");

const DEFAULT_SESSION_TTL = 8 * 60 * 60 * 1000;
const DEFAULT_CLEANUP_INTERVAL = 15 * 60 * 1000;

class PostgresSessionStore extends session.Store {
    constructor(options = {}) {
        super();

        if (!options.pool) {
            throw new Error("PostgreSQL session store requires a database pool.");
        }

        this.pool = options.pool;
        this.tableName = options.tableName || "win_sessions";
        this.cleanupIntervalMs =
            options.cleanupIntervalMs || DEFAULT_CLEANUP_INTERVAL;

        if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(this.tableName)) {
            throw new Error("Invalid PostgreSQL session table name.");
        }

        this.cleanupTimer = null;
    }

    getExpiration(sess) {
        const cookie = sess && sess.cookie;

        if (cookie && cookie.expires) {
            const expiration = new Date(cookie.expires).getTime();

            if (Number.isFinite(expiration)) {
                return expiration;
            }
        }

        if (cookie && Number.isFinite(Number(cookie.maxAge))) {
            return Date.now() + Math.max(0, Number(cookie.maxAge));
        }

        return Date.now() + DEFAULT_SESSION_TTL;
    }

    async initialize() {
        const result = await this.pool.query(
            "SELECT to_regclass($1) AS table_name",
            [`public.${this.tableName}`]
        );

        if (!result.rows[0] || !result.rows[0].table_name) {
            throw new Error(
                `PostgreSQL session table "${this.tableName}" does not exist.`
            );
        }

        await this.removeExpiredSessions();

        if (!this.cleanupTimer) {
            this.cleanupTimer = setInterval(() => {
                this.removeExpiredSessions().catch(error => {
                    console.error(
                        "PostgreSQL session cleanup failed:",
                        error.message
                    );
                });
            }, this.cleanupIntervalMs);

            if (typeof this.cleanupTimer.unref === "function") {
                this.cleanupTimer.unref();
            }
        }

        console.log("PostgreSQL session store initialized.");
    }

    get(sid, callback) {
        this.pool.query(
            `SELECT sess FROM ${this.tableName}
             WHERE sid = $1 AND expires_at > $2`,
            [sid, Date.now()]
        ).then(result => {
            if (result.rows.length === 0) {
                return callback(null, null);
            }

            let sessionData;

            try {
                sessionData = JSON.parse(result.rows[0].sess);
            } catch (error) {
                return callback(error);
            }

            callback(null, sessionData);
        }).catch(callback);
    }

    set(sid, sess, callback = () => {}) {
        let serialized;

        try {
            serialized = JSON.stringify(sess);
        } catch (error) {
            return callback(error);
        }

        if (serialized === undefined) {
            return callback(
                new Error("Session data could not be serialized.")
            );
        }

        const expiresAt = this.getExpiration(sess);

        this.pool.query(
            `INSERT INTO ${this.tableName} (sid, sess, expires_at)
             VALUES ($1, $2, $3)
             ON CONFLICT (sid)
             DO UPDATE SET
                 sess = EXCLUDED.sess,
                 expires_at = EXCLUDED.expires_at`,
            [sid, serialized, expiresAt]
        ).then(() => callback()).catch(callback);
    }

    touch(sid, sess, callback = () => {}) {
        const expiresAt = this.getExpiration(sess);

        this.pool.query(
            `UPDATE ${this.tableName}
             SET expires_at = $1
             WHERE sid = $2`,
            [expiresAt, sid]
        ).then(() => callback()).catch(callback);
    }

    destroy(sid, callback = () => {}) {
        this.pool.query(
            `DELETE FROM ${this.tableName} WHERE sid = $1`,
            [sid]
        ).then(() => callback()).catch(callback);
    }

    async removeExpiredSessions() {
        const result = await this.pool.query(
            `DELETE FROM ${this.tableName} WHERE expires_at <= $1`,
            [Date.now()]
        );

        return result.rowCount || 0;
    }

    close() {
        if (this.cleanupTimer) {
            clearInterval(this.cleanupTimer);
            this.cleanupTimer = null;
        }

        // The shared PostgreSQL pool is closed by the application,
        // not by this session store.
    }
}

module.exports = PostgresSessionStore;
