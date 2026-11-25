
"use strict";

const express = require("express");
const bcrypt = require("bcryptjs");
const pool = require("../config/postgresDatabase");

const {
    createEmailToken,
    consumeEmailToken
} = require("../services/emailTokenService");

const { sendEmail } = require("../services/emailService");
const { checkLimit } = require("../services/emailRateLimitService");

const router = express.Router();

const RESET_EXPIRY_MINUTES = 10;

async function get(sql, params = []) {
    const result = await pool.query(sql, params);
    return result.rows[0] || null;
}

async function run(sql, params = []) {
    const result = await pool.query(sql, params);

    return {
        changes: result.rowCount,
        rows: result.rows
    };
}

async function recordSecurityEvent(userId, email, eventType, req) {
    try {
        await pool.query(
            `INSERT INTO email_security_events (
                user_id, email, event_type, ip_address, user_agent
            ) VALUES ($1, $2, $3, $4, $5)`,
            [
                userId || null,
                email || null,
                eventType,
                req.ip || null,
                req.get("user-agent") || null
            ]
        );
    } catch (error) {
        console.error("Security event log failed:", error.message);
    }
}

async function checkRequestLimit(identifier, action, settings) {
    return checkLimit({
        identifier,
        action,
        ...settings
    });
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

async function sendPasswordResetEmail(user, token) {
    const appUrl = (process.env.APP_URL || "http://localhost:3000")
        .replace(/\/+$/, "");

    const resetUrl =
        `${appUrl}/password-reset.html?token=${encodeURIComponent(token)}`;

    const subject = "Reset your password - WIN Business Suite";
    const safeName = escapeHtml(user.full_name || "there");

    const text = [
        `Hello ${user.full_name || "there"},`,
        "",
        "A password reset was requested for your WIN Business Suite account.",
        "Open the link below to choose a new password:",
        resetUrl,
        "",
        "This link expires in 10 minutes and can only be used once.",
        "If you did not request this, ignore this email. Your password will not change.",
        "",
        "WIN Business Suite Team"
    ].join("\n");

    const html = `
        <!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Reset your password</title>
        </head>
        <body style="margin:0;padding:30px 12px;background:#f3f6fb;font-family:Arial,sans-serif;color:#17233c;">
            <div style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:14px;overflow:hidden;border:1px solid #e4eaf2;">
                <div style="background:#101d3a;padding:30px;text-align:center;">
                    <h1 style="margin:0;color:#ffffff;font-size:27px;">WIN <span style="color:#25c4e8;">Business Suite</span></h1>
                    <p style="margin:10px 0 0;color:#d8e5f7;font-size:13px;">Manage Everything. Grow Smarter.</p>
                </div>
                <div style="padding:32px 28px;">
                    <h2 style="color:#101d3a;">Reset your password</h2>
                    <p>Hello ${safeName},</p>
                    <p>We received a request to reset your WIN Business Suite password. Use the button below to choose a new password.</p>
                    <div style="text-align:center;margin:30px 0;">
                        <a href="${resetUrl}" style="display:inline-block;background:#13b9df;color:#ffffff;text-decoration:none;font-weight:bold;padding:15px 25px;border-radius:8px;">
                            Reset Password
                        </a>
                    </div>
                    <p style="font-size:13px;color:#58677e;">This link expires in <strong>10 minutes</strong> and can only be used once.</p>
                    <p style="font-size:13px;color:#58677e;">If you did not request this, ignore this email. Your password will not change.</p>
                </div>
                <div style="background:#f3f6fb;padding:20px;text-align:center;color:#68758a;font-size:12px;">
                    WIN Business Suite Team<br>
                    Bori Technologies Group
                </div>
            </div>
        </body>
        </html>
    `;

    const result = await sendEmail({
        to: user.email,
        subject,
        text,
        html
    });

    await run(
        `INSERT INTO email_delivery_logs (
            user_id, recipient_email, email_type, subject,
            status, provider_message_id
        ) VALUES ($1, $2, 'password_reset', $3, 'sent', $4)`,
        [user.id, user.email, subject, result.messageId || null]
    );
}

async function sendPasswordChangedNotice(user) {
    const subject = "Your WIN Business Suite password was changed";

    const text = [
        `Hello ${user.full_name},`,
        "",
        "Your WIN Business Suite account password has been changed.",
        "If you made this change, no further action is needed.",
        "If you did not make this change, contact WIN Business Suite support immediately.",
        "",
        "For your security, never share your password or email confirmation links.",
        "",
        "WIN Business Suite Team"
    ].join("\n");

    const safeName = escapeHtml(user.full_name || "there");

    const html = `
        <!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Password changed</title>
        </head>
        <body style="margin:0;padding:30px 12px;background:#f3f6fb;font-family:Arial,sans-serif;color:#17233c;">
            <div style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:14px;overflow:hidden;border:1px solid #e4eaf2;">
                <div style="background:#101d3a;padding:30px;text-align:center;">
                    <h1 style="margin:0;color:#ffffff;font-size:27px;">WIN <span style="color:#25c4e8;">Business Suite</span></h1>
                </div>
                <div style="padding:32px 28px;">
                    <h2 style="color:#101d3a;">Password changed</h2>
                    <p>Hello ${safeName},</p>
                    <p>Your WIN Business Suite account password has been changed.</p>
                    <p>If you made this change, no further action is needed.</p>
                    <p style="color:#a33b36;">If you did not make this change, contact WIN Business Suite support immediately.</p>
                    <p>Never share your password or email confirmation links.</p>
                </div>
                <div style="background:#f3f6fb;padding:20px;text-align:center;color:#68758a;font-size:12px;">
                    WIN Business Suite Team<br>
                    Bori Technologies Group
                </div>
            </div>
        </body>
        </html>
    `;

    const result = await sendEmail({
        to: user.email,
        subject,
        text,
        html
    });

    await run(
        `INSERT INTO email_delivery_logs (
            user_id, recipient_email, email_type, subject,
            status, provider_message_id
        ) VALUES ($1, $2, 'password_changed', $3, 'sent', $4)`,
        [user.id, user.email, subject, result.messageId || null]
    );
}

// REQUEST PASSWORD RESET
router.post("/password-reset/request", async (req, res) => {
    const genericResponse = {
        success: true,
        message: "If a verified account exists for that email, a password reset link will be sent. The link expires in 10 minutes."
    };

    try {
        const ipResult = await checkRequestLimit(
            req.ip || "unknown",
            "password-reset-request:ip",
            {
                maxRequests: 5,
                windowMinutes: 15,
                blockMinutes: 30
            }
        );

        if (!ipResult.allowed) {
            res.set("Retry-After", String(ipResult.retryAfterSeconds));

            return res.status(429).json({
                success: false,
                message: "Too many reset requests. Please wait before trying again.",
                retryAfterSeconds: ipResult.retryAfterSeconds
            });
        }

        const email = typeof req.body.email === "string"
            ? req.body.email.trim().toLowerCase()
            : "";

        if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
            return res.json(genericResponse);
        }

        const emailResult = await checkRequestLimit(
            email,
            "password-reset-request:email",
            {
                maxRequests: 3,
                windowMinutes: 15,
                blockMinutes: 30
            }
        );

        if (!emailResult.allowed) {
            res.set("Retry-After", String(emailResult.retryAfterSeconds));

            return res.status(429).json({
                success: false,
                message: "Too many reset requests. Please wait before trying again.",
                retryAfterSeconds: emailResult.retryAfterSeconds
            });
        }

        const user = await get(
            `SELECT id, full_name, email, email_verified
             FROM users
             WHERE email = $1`,
            [email]
        );

        // Do not reveal whether an email address has an account.
        if (!user || Number(user.email_verified) !== 1) {
            return res.json(genericResponse);
        }

        const token = await createEmailToken(
            user.id,
            "password_reset",
            RESET_EXPIRY_MINUTES
        );

        try {
            await sendPasswordResetEmail(user, token);

            await recordSecurityEvent(
                user.id,
                user.email,
                "password_reset_requested",
                req
            );
        } catch (emailError) {
            console.error("Password reset email failed:", emailError.message);

            await run(
                `INSERT INTO email_delivery_logs (
                    user_id, recipient_email, email_type, subject,
                    status, error_message
                ) VALUES ($1, $2, 'password_reset', $3, 'failed', $4)`,
                [
                    user.id,
                    user.email,
                    "Reset your password - WIN Business Suite",
                    String(emailError.message).slice(0, 500)
                ]
            );
        }

        return res.json(genericResponse);

    } catch (error) {
        console.error("Password reset request error:", error.message);

        return res.status(503).json({
            success: false,
            message: "Password reset is temporarily unavailable. Please try again later."
        });
    }
});

// COMPLETE PASSWORD RESET
router.post("/password-reset/complete", async (req, res) => {
    try {
        const ipResult = await checkRequestLimit(
            req.ip || "unknown",
            "password-reset-complete:ip",
            {
                maxRequests: 10,
                windowMinutes: 15,
                blockMinutes: 15
            }
        );

        if (!ipResult.allowed) {
            res.set("Retry-After", String(ipResult.retryAfterSeconds));

            return res.status(429).json({
                success: false,
                message: "Too many attempts. Please wait before trying again.",
                retryAfterSeconds: ipResult.retryAfterSeconds
            });
        }

        const { token, password } = req.body;

        if (
            typeof token !== "string" ||
            typeof password !== "string"
        ) {
            return res.status(400).json({
                success: false,
                message: "The reset link and new password are required."
            });
        }

        if (password.length < 12 || password.length > 128) {
            return res.status(400).json({
                success: false,
                message: "Your new password must contain 12 to 128 characters."
            });
        }

        const userId = await consumeEmailToken(
            token,
            "password_reset"
        );

        if (!userId) {
            return res.status(400).json({
                success: false,
                message: "This password reset link is invalid, expired, or already used. Please request a new link."
            });
        }

        const passwordHash = await bcrypt.hash(password, 12);

        const updateResult = await run(
            `UPDATE users
             SET password_hash = $1
             WHERE id = $2
               AND email_verified = 1`,
            [passwordHash, userId]
        );

        if (updateResult.changes !== 1) {
            return res.status(400).json({
                success: false,
                message: "The account could not be updated. Please request a new reset link."
            });
        }

        // Invalidate outstanding login confirmation links after a password change.
        await run(
            `UPDATE email_tokens
             SET used_at = CURRENT_TIMESTAMP
             WHERE user_id = $1
               AND purpose = 'login_confirmation'
               AND used_at IS NULL`,
            [userId]
        );

        const user = await get(
            `SELECT id, full_name, email
             FROM users
             WHERE id = $1`,
            [userId]
        );

        if (!user) {
            throw new Error("Updated account could not be found.");
        }

        await recordSecurityEvent(
            user.id,
            user.email,
            "password_changed",
            req
        );

        // Password change succeeds even if the notification email fails.
        try {
            await sendPasswordChangedNotice(user);
        } catch (noticeError) {
            console.error(
                "Password-change notification failed:",
                noticeError.message
            );

            try {
                await run(
                    `INSERT INTO email_delivery_logs (
                        user_id, recipient_email, email_type, subject,
                        status, error_message
                    ) VALUES ($1, $2, 'password_changed', $3, 'failed', $4)`,
                    [
                        user.id,
                        user.email,
                        "Your WIN Business Suite password was changed",
                        String(noticeError.message).slice(0, 500)
                    ]
                );
            } catch (logError) {
                console.error("Notification log failed:", logError.message);
            }
        }

        return res.json({
            success: true,
            message: "Your password has been changed successfully. You can now log in using your new password."
        });

    } catch (error) {
        console.error("Password reset completion error:", error.message);

        return res.status(500).json({
            success: false,
            message: "Your password could not be changed. Please try again."
        });
    }
});

module.exports = router;
