
"use strict";

const pool = require("./postgresDatabase");

async function migrateLoginConfirmationCodes() {
    await pool.query(`
        CREATE TABLE IF NOT EXISTS login_confirmation_codes (
            id BIGSERIAL PRIMARY KEY,
            user_id BIGINT NOT NULL,
            code_hash CHAR(64) NOT NULL,
            attempts INTEGER NOT NULL DEFAULT 0
                CHECK (attempts >= 0 AND attempts <= 10),
            created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
            expires_at TIMESTAMPTZ NOT NULL,
            used_at TIMESTAMPTZ,
            invalidated_at TIMESTAMPTZ
        )
    `);

    await pool.query(`
        CREATE INDEX IF NOT EXISTS
        idx_login_confirmation_codes_user
        ON login_confirmation_codes (user_id, created_at DESC)
    `);

    await pool.query(`
        CREATE INDEX IF NOT EXISTS
        idx_login_confirmation_codes_expiry
        ON login_confirmation_codes (expires_at)
    `);

    await pool.query(`
        CREATE TABLE IF NOT EXISTS login_confirmation_attempt_limits (
            user_id BIGINT PRIMARY KEY,
            window_started_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
            failed_attempts INTEGER NOT NULL DEFAULT 0
                CHECK (failed_attempts >= 0 AND failed_attempts <= 10),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
        )
    `);

    console.log("Login confirmation code migration completed.");
}

module.exports = migrateLoginConfirmationCodes;
