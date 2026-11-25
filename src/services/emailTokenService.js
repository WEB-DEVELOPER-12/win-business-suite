
const crypto = require("crypto");
const pool = require("../config/postgresDatabase");

const ALLOWED_PURPOSES = new Set([
    "email_verification",
    "login_confirmation",
    "password_reset"
]);

function hashToken(token) {
    const secret = process.env.EMAIL_VERIFICATION_SECRET;

    if (!secret || secret.length < 32) {
        throw new Error(
            "EMAIL_VERIFICATION_SECRET is missing or too short."
        );
    }

    return crypto
        .createHmac("sha256", secret)
        .update(token)
        .digest("hex");
}

async function createEmailToken(
    userId,
    purpose,
    expiresMinutes = 1440
) {
    if (
        !Number.isSafeInteger(Number(userId)) ||
        Number(userId) <= 0
    ) {
        throw new Error("A valid user ID is required.");
    }

    if (!ALLOWED_PURPOSES.has(purpose)) {
        throw new Error("Invalid email-token purpose.");
    }

    if (
        !Number.isInteger(expiresMinutes) ||
        expiresMinutes < 1 ||
        expiresMinutes > 1440
    ) {
        throw new Error("Invalid token expiration period.");
    }

    const token = crypto.randomBytes(32).toString("base64url");
    const tokenHash = hashToken(token);

    const client = await pool.connect();

    try {
        await client.query("BEGIN");

        await client.query(
            `UPDATE email_tokens
             SET used_at = CURRENT_TIMESTAMP
             WHERE user_id = $1
             AND purpose = $2
             AND used_at IS NULL`,
            [Number(userId), purpose]
        );

        await client.query(
            `INSERT INTO email_tokens (
                user_id,
                token_hash,
                purpose,
                expires_at
            )
            VALUES (
                $1,
                $2,
                $3,
                CURRENT_TIMESTAMP + ($4 * INTERVAL '1 minute')
            )`,
            [
                Number(userId),
                tokenHash,
                purpose,
                expiresMinutes
            ]
        );

        await client.query("COMMIT");

        return token;
    } catch (error) {
        await client.query("ROLLBACK");
        throw error;
    } finally {
        client.release();
    }
}

async function consumeEmailToken(token, purpose) {
    if (
        typeof token !== "string" ||
        token.length < 20 ||
        token.length > 200 ||
        !ALLOWED_PURPOSES.has(purpose)
    ) {
        return null;
    }

    const tokenHash = hashToken(token);

    const result = await pool.query(
        `UPDATE email_tokens
         SET used_at = CURRENT_TIMESTAMP
         WHERE token_hash = $1
         AND purpose = $2
         AND used_at IS NULL
         AND expires_at > CURRENT_TIMESTAMP
         RETURNING user_id`,
        [tokenHash, purpose]
    );

    return result.rows.length > 0
        ? Number(result.rows[0].user_id)
        : null;
}

module.exports = {
    createEmailToken,
    consumeEmailToken
};
