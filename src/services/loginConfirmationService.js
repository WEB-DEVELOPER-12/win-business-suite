
const pool = require("../config/postgresDatabase");
const { sendEmail } = require("./emailService");
const { createEmailToken } = require("./emailTokenService");

const EMAIL_SUBJECT = "Confirm your login - WIN Business Suite";
const EXPIRY_MINUTES = 10;

function escapeHtml(value) {
    return String(value || "").replace(/[&<>"']/g, character => {
        const replacements = {
            "&": "&amp;",
            "<": "&lt;",
            ">": "&gt;",
            '"': "&quot;",
            "'": "&#39;"
        };

        return replacements[character];
    });
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

    const token = await createEmailToken(
        userId,
        "login_confirmation",
        EXPIRY_MINUTES
    );

    const appUrl = (process.env.APP_URL || "http://localhost:3000")
        .replace(/\/+$/, "");

    const confirmationUrl =
        `${appUrl}/confirm-login.html?token=${encodeURIComponent(token)}`;

    const safeName = escapeHtml(user.full_name || "there");

    const text = [
        `Hello ${user.full_name || "there"},`,
        "",
        "A login was requested for your WIN Business Suite account.",
        "Open this link and press Confirm Login to complete the sign-in:",
        confirmationUrl,
        "",
        "This confirmation link expires in 10 minutes and can only be used once.",
        "If you did not request this login, ignore this email. Your account will not be signed in through this request.",
        "",
        "WIN Business Suite Team"
    ].join("\n");

    const html = `
        <!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Confirm your login</title>
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
                    <p>A login was requested for your WIN Business Suite account. To complete the login, open the confirmation page and press the Confirm Login button.</p>

                    <div style="text-align:center;margin:30px 0;">
                        <a href="${confirmationUrl}"
                           style="display:inline-block;background:#13b9df;color:#ffffff;text-decoration:none;font-weight:bold;padding:15px 25px;border-radius:8px;">
                            Open Login Confirmation
                        </a>
                    </div>

                    <p style="font-size:13px;color:#58677e;">
                        This link expires in <strong>10 minutes</strong> and can only be used once.
                    </p>

                    <p style="font-size:13px;color:#58677e;">
                        If you did not request this login, you can ignore this email. Your account will not be signed in through this request.
                    </p>

                    <p style="font-size:12px;word-break:break-all;color:#087fa5;">${confirmationUrl}</p>
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
    sendLoginConfirmationEmail
};
