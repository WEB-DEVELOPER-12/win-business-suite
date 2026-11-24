
const db = require("./database");

function run(sql, params = []) {
    return new Promise((resolve, reject) => {
        db.run(sql, params, function (error) {
            if (error) return reject(error);
            resolve(this);
        });
    });
}

function all(sql, params = []) {
    return new Promise((resolve, reject) => {
        db.all(sql, params, (error, rows) => {
            if (error) return reject(error);
            resolve(rows || []);
        });
    });
}

async function addUserColumn(name, sql) {
    const columns = await all("PRAGMA table_info(users)");

    if (!columns.some(column => column.name === name)) {
        await run(sql);
        console.log(`Email security: users.${name} added.`);
    }
}

async function migrateEmailSecurity() {
    await run("BEGIN IMMEDIATE");

    try {
        // Existing accounts remain verified by default.
        // New registrations will explicitly set this to 0.
        await addUserColumn(
            "email_verified",
            `ALTER TABLE users
             ADD COLUMN email_verified INTEGER NOT NULL DEFAULT 1
             CHECK (email_verified IN (0, 1))`
        );

        await addUserColumn(
            "email_verified_at",
            "ALTER TABLE users ADD COLUMN email_verified_at DATETIME"
        );

        await run(`
            CREATE TABLE IF NOT EXISTS email_tokens (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL,
                token_hash TEXT NOT NULL UNIQUE,
                purpose TEXT NOT NULL CHECK (
                    purpose IN (
                        'email_verification',
                        'login_confirmation',
                        'password_reset'
                    )
                ),
                expires_at DATETIME NOT NULL,
                used_at DATETIME,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(id)
                    ON DELETE CASCADE
            )
        `);

        await run(`
            CREATE TABLE IF NOT EXISTS email_delivery_logs (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER,
                recipient_email TEXT NOT NULL,
                email_type TEXT NOT NULL,
                subject TEXT NOT NULL,
                status TEXT NOT NULL CHECK (
                    status IN ('queued', 'sent', 'failed')
                ),
                provider_message_id TEXT,
                error_message TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(id)
                    ON DELETE SET NULL
            )
        `);

        await run(`
            CREATE TABLE IF NOT EXISTS email_security_events (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER,
                email TEXT,
                event_type TEXT NOT NULL,
                ip_address TEXT,
                user_agent TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(id)
                    ON DELETE SET NULL
            )
        `);

        await run(`
            CREATE TABLE IF NOT EXISTS email_request_limits (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                identifier_hash TEXT NOT NULL,
                action TEXT NOT NULL,
                window_started_at DATETIME NOT NULL,
                request_count INTEGER NOT NULL DEFAULT 0,
                blocked_until DATETIME,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                UNIQUE (identifier_hash, action)
            )
        `);

        const indexes = [
            `CREATE INDEX IF NOT EXISTS idx_email_tokens_user_purpose
             ON email_tokens (user_id, purpose)`,

            `CREATE INDEX IF NOT EXISTS idx_email_tokens_expiry
             ON email_tokens (expires_at)`,

            `CREATE INDEX IF NOT EXISTS idx_email_delivery_logs_date
             ON email_delivery_logs (created_at)`,

            `CREATE INDEX IF NOT EXISTS idx_email_delivery_logs_status
             ON email_delivery_logs (status, created_at)`,

            `CREATE INDEX IF NOT EXISTS idx_email_security_events_user
             ON email_security_events (user_id, created_at)`,

            `CREATE INDEX IF NOT EXISTS idx_email_security_events_type
             ON email_security_events (event_type, created_at)`,

            `CREATE INDEX IF NOT EXISTS idx_email_request_limits_block
             ON email_request_limits (blocked_until)`
        ];

        for (const sql of indexes) {
            await run(sql);
        }

        await run("COMMIT");

        console.log("WIN email security database migration completed.");
    } catch (error) {
        try {
            await run("ROLLBACK");
        } catch (rollbackError) {
            console.error(
                "Email security migration rollback failed:",
                rollbackError.message
            );
        }

        throw error;
    }
}

module.exports = migrateEmailSecurity;
