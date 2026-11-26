
"use strict";

const crypto = require("crypto");
const pool = require("../config/postgresDatabase");
const { sendEmail } = require("./emailService");

const EMAIL_SUBJECT = "Your WIN Business Suite login code";
const EXPIRY_MINUTES = 10;
const ATTEMPT_WINDOW_MINUTES = 20;
const MAX_INCORRECT_ATTEMPTS = 10;

function getSecret() {
    const secret = process.env.EMAIL_VERIFICATION_SECRET;

    if (!secret || secret.length < 32) {
        throw new Error(
            "EMAIL_VERIFICATION_SECRET must contain at least 32 characters."
        );
    }

    return secret;
}

function hashCode(userId, code) {
    return crypto
        .createHmac("sha256", getSecret())
        .update(`${userId}:${code}`)
        .digest("hex");
}

function safeCompareHashes(first, second) {
    const firstBuffer = Buffer.from(first, "hex");
    const secondBuffer = Buffer.from(second, "hex");

    return (
        firstBuffer.length === secondBuffer.length &&
        crypto.timingSafeEqual(firstBuffer, secondBuffer)
    );
}

function escapeHtml(value) {
    const replacements = {
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;"
    };

    return String(value || "").replace(
        /[&<>"']/g,
        character => replacements[character]
    );
}

async function createLoginConfirmationCode(userId) {
    const client = await pool.connect();

    try {
        await client.query("BEGIN");

        const userResult = await client.query(
            `SELECT id
             FROM users
             WHERE id = $1
             FOR UPDATE`,
            [userId]
        );

        if (userResult.rowCount === 0) {
            throw new Error("User account was not found.");
        }

        const code = crypto
            .randomInt(100000, 1000000)
            .toString();

        const codeHash = hashCode(userId, code);

        await client.query(
            `UPDATE login_confirmation_codes
             SET invalidated_at = CURRENT_TIMESTAMP
             WHERE user_id = $1
               AND used_at IS NULL
               AND invalidated_at IS NULL`,
            [userId]
        );

        await client.query(
            `INSERT INTO login_confirmation_codes (
                user_id,
                code_hash,
                expires_at
             )
             VALUES (
                $1,
                $2,
                CURRENT_TIMESTAMP + INTERVAL '10 minutes'
             )`,
            [userId, codeHash]
        );

        await client.query("COMMIT");

        return code;
    } catch (error) {
        await client.query("ROLLBACK");
        throw error;
    } finally {
        client.release();
    }
}

async function invalidateLoginConfirmationCode(userId, code) {
    const codeHash = hashCode(userId, code);

    await pool.query(
        `UPDATE login_confirmation_codes
         SET invalidated_at = CURRENT_TIMESTAMP
         WHERE user_id = $1
           AND code_hash = $2
           AND used_at IS NULL
           AND invalidated_at IS NULL`,
        [userId, codeHash]
    );
}

async function verifyLoginConfirmationCode(email, code) {
    const normalizedEmail = String(email || "").trim().toLowerCase();
    const submittedCode = String(code || "").trim();

    if (
        !normalizedEmail ||
        !/^\d{6}$/.test(submittedCode)
    ) {
        return {
            success: false,
            reason: "invalid_code"
        };
    }

    const client = await pool.connect();

    try {
        await client.query("BEGIN");

        const userResult = await client.query(
            `SELECT id
             FROM users
             WHERE LOWER(email) = LOWER($1)
             FOR UPDATE`,
            [normalizedEmail]
        );

        if (userResult.rowCount === 0) {
            await client.query("COMMIT");

            return {
                success: false,
                reason: "invalid_code"
            };
        }

        const userId = Number(userResult.rows[0].id);

        await client.query(
            `INSERT INTO login_confirmation_attempt_limits (
                user_id,
                window_started_at,
                failed_attempts,
                updated_at
             )
             VALUES (
                $1,
                CURRENT_TIMESTAMP,
                0,
                CURRENT_TIMESTAMP
             )
             ON CONFLICT (user_id) DO NOTHING`,
            [userId]
        );

        let limitResult = await client.query(
            `SELECT
                window_started_at,
                failed_attempts,
                GREATEST(
                    0,
                    CEIL(
                        EXTRACT(
                            EPOCH FROM (
                                window_started_at
                                + INTERVAL '20 minutes'
                                - CURRENT_TIMESTAMP
                            )
                        )
                    )
                ) AS retry_after_seconds
             FROM login_confirmation_attempt_limits
             WHERE user_id = $1
             FOR UPDATE`,
            [userId]
        );

        let attemptLimit = limitResult.rows[0];

        const windowExpired =
            Date.now() -
            new Date(attemptLimit.window_started_at).getTime()
            >= ATTEMPT_WINDOW_MINUTES * 60 * 1000;

        if (windowExpired) {
            await client.query(
                `UPDATE login_confirmation_attempt_limits
                 SET window_started_at = CURRENT_TIMESTAMP,
                     failed_attempts = 0,
                     updated_at = CURRENT_TIMESTAMP
                 WHERE user_id = $1`,
                [userId]
            );

            limitResult = await client.query(
                `SELECT
                    window_started_at,
                    failed_attempts,
                    GREATEST(
                        0,
                        CEIL(
                            EXTRACT(
                                EPOCH FROM (
                                    window_started_at
                                    + INTERVAL '20 minutes'
                                    - CURRENT_TIMESTAMP
                                )
                            )
                        )
                    ) AS retry_after_seconds
                 FROM login_confirmation_attempt_limits
                 WHERE user_id = $1
                 FOR UPDATE`,
                [userId]
            );

            attemptLimit = limitResult.rows[0];
        }

        if (
            Number(attemptLimit.failed_attempts) >=
            MAX_INCORRECT_ATTEMPTS
        ) {
            await client.query("COMMIT");

            return {
                success: false,
                reason: "too_many_attempts",
                retryAfterSeconds: Number(
                    attemptLimit.retry_after_seconds
                )
            };
        }

        const codeResult = await client.query(
            `SELECT id, code_hash, expires_at
             FROM login_confirmation_codes
             WHERE user_id = $1
               AND used_at IS NULL
               AND invalidated_at IS NULL
             ORDER BY created_at DESC
             LIMIT 1
             FOR UPDATE`,
            [userId]
        );

        if (codeResult.rowCount === 0) {
            await client.query("COMMIT");

            return {
                success: false,
                reason: "invalid_or_expired"
            };
        }

        const savedCode = codeResult.rows[0];

        if (new Date(savedCode.expires_at).getTime() <= Date.now()) {
            await client.query(
                `UPDATE login_confirmation_codes
                 SET invalidated_at = CURRENT_TIMESTAMP
                 WHERE id = $1`,
                [savedCode.id]
            );

            await client.query("COMMIT");

            return {
                success: false,
                reason: "invalid_or_expired"
            };
        }

        const submittedHash = hashCode(userId, submittedCode);

        if (!safeCompareHashes(savedCode.code_hash, submittedHash)) {
            await client.query(
                `UPDATE login_confirmation_codes
                 SET attempts = LEAST(attempts + 1, 10)
                 WHERE id = $1`,
                [savedCode.id]
            );

            const updatedLimit = await client.query(
                `UPDATE login_confirmation_attempt_limits
                 SET failed_attempts = failed_attempts + 1,
                     updated_at = CURRENT_TIMESTAMP
                 WHERE user_id = $1
                 RETURNING failed_attempts,
                     GREATEST(
                        0,
                        CEIL(
                            EXTRACT(
                                EPOCH FROM (
                                    window_started_at
                                    + INTERVAL '20 minutes'
                                    - CURRENT_TIMESTAMP
                                )
                            )
                        )
                     ) AS retry_after_seconds`,
                [userId]
            );

            const failedAttempts = Number(
                updatedLimit.rows[0].failed_attempts
            );

            await client.query("COMMIT");

            return {
                success: false,
                reason: failedAttempts >= MAX_INCORRECT_ATTEMPTS
                    ? "too_many_attempts"
                    : "invalid_code",
                attemptsRemaining: Math.max(
                    0,
                    MAX_INCORRECT_ATTEMPTS - failedAttempts
                ),
                retryAfterSeconds: Number(
                    updatedLimit.rows[0].retry_after_seconds
                )
            };
        }

        await client.query(
            `UPDATE login_confirmation_codes
             SET used_at = CURRENT_TIMESTAMP
             WHERE id = $1`,
            [savedCode.id]
        );

        await client.query("COMMIT");

        return {
            success: true,
            userId
        };
    } catch (error) {
        await client.query("ROLLBACK");
        throw error;
    } finally {
        client.release();
    }
}

async function sendLoginConfirmationEmail(user) {
    if (
        !user ||
        !Number.isSafeInteger(Number(user.id)) ||
        Number(user.id) <= 0 ||
        !user.email
    ) {
        throw new Error("Valid user details are required.");
    }

    const userId = Number(user.id);
    const safeName = escapeHtml(user.full_name || "there");

    const code = await createLoginConfirmationCode(userId);

    const text = [
        `Hello ${user.full_name || "there"},`,
        "",
        "A login was requested for your WIN Business Suite account.",
        "",
        `Your login confirmation code is: ${code}`,
        "",
        "Enter this 6-digit code on the WIN Business Suite login confirmation page.",
        "The code expires in 10 minutes and can only be used once.",
        "A maximum of 10 incorrect attempts is allowed within 20 minutes.",
        "",
        "If you did not request this login, you can ignore this email.",
        "",
        "WIN Business Suite Team",
        "Bori Technologies Group"
    ].join("\n");

    const html = `
        <!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Your login confirmation code</title>
        </head>
        <body style="margin:0;padding:30px 12px;background:#f3f6fb;font-family:Arial,sans-serif;color:#17233c;">
            <div style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:14px;overflow:hidden;border:1px solid #e4eaf2;">
                <div style="background:#101d3a;padding:30px;text-align:center;">
                    <h1 style="margin:0;color:#ffffff;font-size:27px;">WIN <span style="color:#25c4e8;">Business Suite</span></h1>
                    <p style="margin:10px 0 0;color:#d8e5f7;font-size:13px;">Manage Everything. Grow Smarter.</p>
                </div>

                <div style="padding:32px 28px;">
                    <h2 style="margin-top:0;color:#101d3a;">Confirm your login</h2>
                    <p>Hello ${safeName},</p>
                    <p>A login was requested for your WIN Business Suite account. Enter the following code on the login confirmation page:</p>

                    <div style="text-align:center;margin:30px 0;padding:22px;background:#f3f6fb;border-radius:10px;">
                        <span style="font-size:34px;font-weight:bold;letter-spacing:9px;color:#101d3a;">
                            ${code}
                        </span>
                    </div>

                    <p style="font-size:13px;color:#58677e;">
                        This code expires in <strong>10 minutes</strong> and can only be used once.
                    </p>

                    <p style="font-size:13px;color:#58677e;">
                        A maximum of <strong>10 incorrect attempts within 20 minutes</strong> is allowed.
                    </p>

                    <p style="font-size:13px;color:#58677e;">
                        If you did not request this login, you can ignore this email.
                    </p>
                </div>

                <div style="background:#f3f6fb;padding:20px;text-align:center;color:#68758a;font-size:12px;">
                    WIN Business Suite Team<br>
                    Bori Technologies Group
                </div>
            </div>
        </body>
        </html>
    `;

    try {
        const result = await sendEmail({
            to: user.email,
            subject: EMAIL_SUBJECT,
            text,
            html
        });

        if (result.rejected && result.rejected.length > 0) {
            throw new Error("The email provider rejected the recipient.");
        }

        await pool.query(
            `INSERT INTO email_delivery_logs (
                user_id,
                recipient_email,
                email_type,
                subject,
                status,
                provider_message_id
            )
            VALUES ($1, $2, $3, $4, 'sent', $5)`,
            [
                userId,
                user.email,
                "login_confirmation",
                EMAIL_SUBJECT,
                result.messageId || null
            ]
        );

        return {
            success: true,
            expiresInMinutes: EXPIRY_MINUTES
        };
    } catch (error) {
        try {
            await invalidateLoginConfirmationCode(userId, code);
        } catch (invalidateError) {
            console.error(
                "Login code invalidation failed:",
                invalidateError.message
            );
        }

        try {
            await pool.query(
                `INSERT INTO email_delivery_logs (
                    user_id,
                    recipient_email,
                    email_type,
                    subject,
                    status,
                    error_message
                )
                VALUES ($1, $2, $3, $4, 'failed', $5)`,
                [
                    userId,
                    user.email,
                    "login_confirmation",
                    EMAIL_SUBJECT,
                    String(error.message).slice(0, 500)
                ]
            );
        } catch (logError) {
            console.error(
                "Login email log failed:",
                logError.message
            );
        }

        throw error;
    }
}

module.exports = {
    sendLoginConfirmationEmail,
    verifyLoginConfirmationCode
};
