"use strict";

const crypto = require("crypto");
const pool = require("../config/postgresDatabase");

function hashIdentifier(identifier) {
    const secret = process.env.EMAIL_VERIFICATION_SECRET;

    if (!secret || secret.length < 32) {
        throw new Error("Email verification secret is missing or invalid.");
    }

    return crypto
        .createHmac("sha256", secret)
        .update(String(identifier).trim().toLowerCase())
        .digest("hex");
}

async function checkLimit({
    identifier,
    action,
    maxRequests,
    windowMinutes,
    blockMinutes
}) {
    if (!identifier || !action) {
        throw new Error("Rate-limit identifier and action are required.");
    }

    if (
        !Number.isInteger(maxRequests) ||
        !Number.isInteger(windowMinutes) ||
        !Number.isInteger(blockMinutes) ||
        maxRequests < 1 ||
        windowMinutes < 1 ||
        blockMinutes < 1
    ) {
        throw new Error("Invalid rate-limit configuration.");
    }

    const identifierHash = hashIdentifier(identifier);

    const result = await pool.query(
        `INSERT INTO email_request_limits (
            identifier_hash,
            action,
            window_started_at,
            request_count,
            blocked_until,
            updated_at
        )
        VALUES (
            $1,
            $2,
            CURRENT_TIMESTAMP,
            1,
            NULL,
            CURRENT_TIMESTAMP
        )

        ON CONFLICT (identifier_hash, action)
        DO UPDATE SET

            request_count = CASE
                WHEN email_request_limits.blocked_until > CURRENT_TIMESTAMP
                    THEN email_request_limits.request_count

                WHEN email_request_limits.blocked_until IS NOT NULL
                     AND email_request_limits.blocked_until <= CURRENT_TIMESTAMP
                    THEN 1

                WHEN email_request_limits.window_started_at <=
                     CURRENT_TIMESTAMP - ($3::integer * INTERVAL '1 minute')
                    THEN 1

                WHEN email_request_limits.request_count >= $4
                    THEN email_request_limits.request_count

                ELSE email_request_limits.request_count + 1
            END,

            window_started_at = CASE
                WHEN email_request_limits.blocked_until > CURRENT_TIMESTAMP
                    THEN email_request_limits.window_started_at

                WHEN email_request_limits.blocked_until IS NOT NULL
                     AND email_request_limits.blocked_until <= CURRENT_TIMESTAMP
                    THEN CURRENT_TIMESTAMP

                WHEN email_request_limits.window_started_at <=
                     CURRENT_TIMESTAMP - ($5::integer * INTERVAL '1 minute')
                    THEN CURRENT_TIMESTAMP

                ELSE email_request_limits.window_started_at
            END,

            blocked_until = CASE
                WHEN email_request_limits.blocked_until > CURRENT_TIMESTAMP
                    THEN email_request_limits.blocked_until

                WHEN email_request_limits.blocked_until IS NOT NULL
                     AND email_request_limits.blocked_until <= CURRENT_TIMESTAMP
                    THEN NULL

                WHEN email_request_limits.window_started_at <=
                     CURRENT_TIMESTAMP - ($6::integer * INTERVAL '1 minute')
                    THEN NULL

                WHEN email_request_limits.request_count >= $7
                    THEN CURRENT_TIMESTAMP + ($8::integer * INTERVAL '1 minute')

                ELSE NULL
            END,

            updated_at = CURRENT_TIMESTAMP

        RETURNING request_count, blocked_until`,
        [
            identifierHash,
            action,
            windowMinutes,
            maxRequests,
            windowMinutes,
            windowMinutes,
            maxRequests,
            blockMinutes
        ]
    );

    const row = result.rows[0];

    if (!row) {
        throw new Error("Rate-limit check returned no result.");
    }

    if (row.blocked_until) {
        const blockedTime = new Date(row.blocked_until).getTime();

        if (!Number.isFinite(blockedTime)) {
            throw new Error("Rate-limit block expiry is invalid.");
        }

        const remainingSeconds = Math.max(
            1,
            Math.ceil((blockedTime - Date.now()) / 1000)
        );

        if (remainingSeconds > 0) {
            return {
                allowed: false,
                retryAfterSeconds: remainingSeconds
            };
        }
    }

    return {
        allowed: true,
        retryAfterSeconds: 0
    };
}

module.exports = {
    checkLimit
};