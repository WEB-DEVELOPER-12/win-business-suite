
const express = require("express");
const bcrypt = require("bcryptjs");
const pool = require("../config/postgresDatabase");

const {
    sendVerificationEmail
} = require("../services/emailVerificationService");

const {
    sendLoginConfirmationEmail,
    verifyLoginConfirmationCode
} = require("../services/loginConfirmationService");

const {
    consumeEmailToken
} = require("../services/emailTokenService");

const {
    sendEmail
} = require("../services/emailService");

const router = express.Router();

async function get(sql, params = []) {
    const result = await pool.query(sql, params);
    return result.rows[0] || null;
}

async function recordSecurityEvent(userId, email, eventType, req) {
    try {
        await pool.query(
            `INSERT INTO email_security_events (
                user_id,
                email,
                event_type,
                ip_address,
                user_agent
            )
            VALUES ($1, $2, $3, $4, $5)`,
            [
                userId || null,
                email || null,
                eventType,
                req.ip || null,
                req.get("user-agent") || null
            ]
        );
    } catch (error) {
        console.error(
            "Security event logging failed:",
            error.message
        );
    }
}

async function logEmailDelivery(
    userId,
    email,
    type,
    subject,
    status,
    messageId = null,
    errorMessage = null
) {
    await pool.query(
        `INSERT INTO email_delivery_logs (
            user_id,
            recipient_email,
            email_type,
            subject,
            status,
            provider_message_id,
            error_message
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [
            userId,
            email,
            type,
            subject,
            status,
            messageId,
            errorMessage
                ? String(errorMessage).slice(0, 500)
                : null
        ]
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

async function sendWelcomeEmail(user) {
    const subject = "Welcome to WIN Business Suite";
    const safeName = escapeHtml(user.full_name);

    const text = [
        `Hello ${user.full_name},`,
        "",
        "Your email address has been successfully verified.",
        "Welcome to WIN Business Suite.",
        "",
        "You can now log in and continue setting up your business.",
        "",
        "WIN Business Suite Team",
        "Manage Everything. Grow Smarter."
    ].join("\n");

    const html = `
        <!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Welcome to WIN Business Suite</title>
        </head>
        <body style="margin:0;padding:30px 12px;background:#f3f6fb;font-family:Arial,sans-serif;color:#17233c;">
            <div style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:14px;overflow:hidden;border:1px solid #e4eaf2;">
                <div style="background:#101d3a;padding:30px;text-align:center;">
                    <h1 style="margin:0;color:#ffffff;font-size:27px;">WIN <span style="color:#25c4e8;">Business Suite</span></h1>
                    <p style="margin:10px 0 0;color:#d8e5f7;font-size:13px;">Manage Everything. Grow Smarter.</p>
                </div>
                <div style="padding:32px 28px;">
                    <h2 style="color:#101d3a;">Welcome aboard!</h2>
                    <p>Hello ${safeName},</p>
                    <p>Your email address has been successfully verified. Welcome to WIN Business Suite!</p>
                    <p>You can now log in and continue setting up your business.</p>
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

    await logEmailDelivery(
        user.id,
        user.email,
        "welcome",
        subject,
        "sent",
        result.messageId || null
    );
}

function destroySession(req) {
    return new Promise((resolve, reject) => {
        if (!req.session || typeof req.session.destroy !== "function") {
            return resolve();
        }

        req.session.destroy(error => {
            if (error) return reject(error);
            resolve();
        });
    });
}

function regenerateSession(req) {
    return new Promise((resolve, reject) => {
        req.session.regenerate(error => {
            if (error) return reject(error);
            resolve();
        });
    });
}

function saveSession(req) {
    return new Promise((resolve, reject) => {
        req.session.save(error => {
            if (error) return reject(error);
            resolve();
        });
    });
}

// REGISTER
router.post("/register", async (req, res) => {
    const {
        business_name,
        business_type,
        full_name,
        email,
        password
    } = req.body;

    try {
        if (
            typeof business_name !== "string" ||
            typeof business_type !== "string" ||
            typeof full_name !== "string" ||
            typeof email !== "string" ||
            typeof password !== "string"
        ) {
            return res.status(400).json({
                success: false,
                message: "All fields are required."
            });
        }

        const cleanBusinessName = business_name.trim();
        const cleanBusinessType = business_type.trim();
        const cleanFullName = full_name.trim();
        const normalizedEmail = email.trim().toLowerCase();

        if (
            !cleanBusinessName ||
            !cleanBusinessType ||
            !cleanFullName ||
            !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)
        ) {
            return res.status(400).json({
                success: false,
                message: "Please provide valid registration details."
            });
        }

        if (password.length < 12 || password.length > 128) {
            return res.status(400).json({
                success: false,
                message: "Password must contain 12 to 128 characters."
            });
        }

        const passwordHash = await bcrypt.hash(password, 12);
        const client = await pool.connect();

        let businessId;
        let userId;

        try {
            await client.query("BEGIN");

            const businessResult = await client.query(
                `INSERT INTO businesses (
                    business_name,
                    business_type
                )
                VALUES ($1, $2)
                RETURNING id`,
                [cleanBusinessName, cleanBusinessType]
            );

            businessId = Number(businessResult.rows[0].id);

            const userResult = await client.query(
                `INSERT INTO users (
                    business_id,
                    full_name,
                    email,
                    password_hash,
                    role,
                    email_verified
                )
                VALUES ($1, $2, $3, $4, 'owner', 0)
                RETURNING id`,
                [
                    businessId,
                    cleanFullName,
                    normalizedEmail,
                    passwordHash
                ]
            );

            userId = Number(userResult.rows[0].id);

            await client.query(
                `INSERT INTO subscriptions (
                    business_id,
                    plan_name,
                    status,
                    trial_started_at,
                    trial_ends_at
                )
                VALUES ($1, 'WIN Pro', 'pending', NULL, NULL)`,
                [businessId]
            );

            await client.query("COMMIT");
        } catch (error) {
            await client.query("ROLLBACK");

            if (error.code === "23505") {
                return res.status(409).json({
                    success: false,
                    message: "Registration failed. This email may already be registered."
                });
            }

            console.error(
                "Registration database error:",
                error.message
            );

            return res.status(500).json({
                success: false,
                message: "Could not complete registration."
            });
        } finally {
            client.release();
        }

        await recordSecurityEvent(
            userId,
            normalizedEmail,
            "account_registered",
            req
        );

        try {
            await sendVerificationEmail({
                id: userId,
                full_name: cleanFullName,
                email: normalizedEmail
            });

            return res.status(201).json({
                success: true,
                emailSent: true,
                message: "Your account has been created. We have sent a verification link to your email address. The link expires in 10 minutes. Please verify your email before logging in.",
                business_id: businessId,
                subscription: {
                    plan: "WIN Pro",
                    status: "pending",
                    trial_started: false,
                    duration_days: 7
                }
            });
        } catch (emailError) {
            console.error(
                "Verification email failed:",
                emailError.message
            );

            return res.status(201).json({
                success: true,
                emailSent: false,
                message: "Your account has been created, but we could not send the verification email. Please use the resend verification option.",
                business_id: businessId,
                subscription: {
                    plan: "WIN Pro",
                    status: "pending",
                    trial_started: false,
                    duration_days: 7
                }
            });
        }
    } catch (error) {
        console.error("Registration error:", error.message);

        return res.status(500).json({
            success: false,
            message: "An unexpected error occurred."
        });
    }
});

// VERIFY EMAIL
router.post("/verify-email", async (req, res) => {
    try {
        const { token } = req.body;

        if (typeof token !== "string" || !token) {
            return res.status(400).json({
                success: false,
                message: "A verification token is required."
            });
        }

        const userId = await consumeEmailToken(
            token,
            "email_verification"
        );

        if (!userId) {
            return res.status(400).json({
                success: false,
                message: "This verification link is invalid, expired, or has already been used."
            });
        }

        const updateResult = await pool.query(
            `UPDATE users
             SET email_verified = 1,
                 email_verified_at = CURRENT_TIMESTAMP
             WHERE id = $1
             AND email_verified = 0
             RETURNING id`,
            [userId]
        );

        if (updateResult.rowCount !== 1) {
            return res.status(400).json({
                success: false,
                message: "This account is already verified or is no longer available."
            });
        }

        const user = await get(
            `SELECT id, full_name, email
             FROM users
             WHERE id = $1`,
            [userId]
        );

        if (!user) {
            return res.status(404).json({
                success: false,
                message: "Account not found."
            });
        }

        await recordSecurityEvent(
            user.id,
            user.email,
            "email_verified",
            req
        );

        try {
            await sendWelcomeEmail(user);
        } catch (welcomeError) {
            console.error(
                "Welcome email failed:",
                welcomeError.message
            );

            try {
                await logEmailDelivery(
                    user.id,
                    user.email,
                    "welcome",
                    "Welcome to WIN Business Suite",
                    "failed",
                    null,
                    welcomeError.message
                );
            } catch (logError) {
                console.error(
                    "Welcome email log failed:",
                    logError.message
                );
            }
        }

        return res.json({
            success: true,
            message: "Your email has been verified successfully. You can now log in to WIN Business Suite."
        });
    } catch (error) {
        console.error(
            "Email verification error:",
            error.message
        );

        return res.status(500).json({
            success: false,
            message: "Email verification could not be completed. Please try again."
        });
    }
});

// RESEND REGISTRATION VERIFICATION EMAIL
router.post("/resend-verification", async (req, res) => {
    try {
        const email = req.body.email;

        if (typeof email !== "string" || !email.trim()) {
            return res.status(400).json({
                success: false,
                message: "Please enter your email address."
            });
        }

        const normalizedEmail = email.trim().toLowerCase();

        const user = await get(
            `SELECT id, full_name, email, email_verified
             FROM users
             WHERE email = $1`,
            [normalizedEmail]
        );

        const genericMessage =
            "If an unverified account exists for this email, a new verification link will be sent.";

        if (!user || Number(user.email_verified) === 1) {
            return res.json({
                success: true,
                message: genericMessage
            });
        }

        try {
            await sendVerificationEmail(user);

            await recordSecurityEvent(
                user.id,
                user.email,
                "verification_email_resent",
                req
            );
        } catch (emailError) {
            console.error(
                "Resend verification failed:",
                emailError.message
            );
        }

        return res.json({
            success: true,
            message: genericMessage
        });
    } catch (error) {
        console.error(
            "Resend verification error:",
            error.message
        );

        return res.status(500).json({
            success: false,
            message: "Could not process your request. Please try again."
        });
    }
});

// LOGIN
// Password verification does not create an authenticated session.
// A fresh 6-digit email confirmation code is required for every login.
router.post("/login", async (req, res) => {
    try {
        const { email, password } = req.body;

        if (
            typeof email !== "string" ||
            typeof password !== "string" ||
            !email.trim() ||
            !password
        ) {
            return res.status(400).json({
                success: false,
                message: "Email and password are required."
            });
        }

        const normalizedEmail = email.trim().toLowerCase();

        const user = await get(
            `SELECT
                id,
                business_id,
                full_name,
                email,
                password_hash,
                role,
                email_verified
             FROM users
             WHERE email = $1`,
            [normalizedEmail]
        );

        if (!user) {
            await recordSecurityEvent(
                null,
                normalizedEmail,
                "login_failed",
                req
            );

            return res.status(401).json({
                success: false,
                message: "Invalid email or password."
            });
        }

        const passwordMatches = await bcrypt.compare(
            password,
            user.password_hash
        );

        if (!passwordMatches) {
            await recordSecurityEvent(
                user.id,
                user.email,
                "login_failed",
                req
            );

            return res.status(401).json({
                success: false,
                message: "Invalid email or password."
            });
        }

        if (Number(user.email_verified) !== 1) {
            await recordSecurityEvent(
                user.id,
                user.email,
                "login_blocked_unverified",
                req
            );

            return res.status(403).json({
                success: false,
                emailVerificationRequired: true,
                message: "Please verify your email address before logging in."
            });
        }

        try {
            await destroySession(req);
        } catch (sessionError) {
            console.error(
                "Previous session cleanup failed:",
                sessionError.message
            );

            return res.status(500).json({
                success: false,
                message: "Could not prepare a secure login. Please try again."
            });
        }

        res.clearCookie("win.sid", {
            httpOnly: true,
            secure: process.env.NODE_ENV === "production",
            sameSite: "lax"
        });

        try {
            await sendLoginConfirmationEmail({
                id: Number(user.id),
                full_name: user.full_name,
                email: user.email
            });

            await recordSecurityEvent(
                user.id,
                user.email,
                "login_confirmation_requested",
                req
            );

            return res.json({
                success: true,
                confirmationRequired: true,
                email: user.email,
                message: "A 6-digit login confirmation code has been sent to your email. It expires in 10 minutes. Enter it on the confirmation page to continue."
            });
        } catch (emailError) {
            console.error(
                "Login confirmation email failed:",
                emailError.message
            );

            await recordSecurityEvent(
                user.id,
                user.email,
                "login_confirmation_email_failed",
                req
            );

            return res.status(503).json({
                success: false,
                message: "We could not send your login confirmation email. Please try again."
            });
        }
    } catch (error) {
        console.error("Login error:", error.message);

        return res.status(500).json({
            success: false,
            message: "Login could not be completed."
        });
    }
});

// RESEND LOGIN CONFIRMATION CODE
// This endpoint is separate from registration email verification.
router.post("/resend-login-code", async (req, res) => {
    try {
        const { email } = req.body;

        if (typeof email !== "string" || !email.trim()) {
            return res.status(400).json({
                success: false,
                message: "Please enter your email address."
            });
        }

        const normalizedEmail = email.trim().toLowerCase();

        const genericMessage =
            "If a verified account exists for this email, a new login code will be sent.";

        const user = await get(
            `SELECT id, full_name, email, email_verified
             FROM users
             WHERE email = $1`,
            [normalizedEmail]
        );

        if (!user || Number(user.email_verified) !== 1) {
            return res.json({
                success: true,
                message: genericMessage
            });
        }

        try {
            await sendLoginConfirmationEmail(user);

            await recordSecurityEvent(
                user.id,
                user.email,
                "login_confirmation_code_resent",
                req
            );
        } catch (emailError) {
            console.error(
                "Resend login code failed:",
                emailError.message
            );
        }

        return res.json({
            success: true,
            message: genericMessage
        });
    } catch (error) {
        console.error(
            "Resend login code error:",
            error.message
        );

        return res.status(500).json({
            success: false,
            message: "Could not process your request. Please try again."
        });
    }
});

// CONFIRM LOGIN
// The session is created only after the 6-digit email code is verified.
router.post("/confirm-login", async (req, res) => {
    try {
        const { email, code } = req.body;

        if (
            typeof email !== "string" ||
            typeof code !== "string" ||
            !email.trim() ||
            !/^\d{6}$/.test(code)
        ) {
            return res.status(400).json({
                success: false,
                message: "Enter your email address and the 6-digit login code."
            });
        }

        const normalizedEmail = email.trim().toLowerCase();

        const verification = await verifyLoginConfirmationCode(
            normalizedEmail,
            code
        );

        if (!verification.success) {
            await recordSecurityEvent(
                verification.userId || null,
                normalizedEmail,
                verification.reason === "too_many_attempts"
                    ? "login_confirmation_attempts_exceeded"
                    : "login_confirmation_code_invalid",
                req
            );

            if (verification.reason === "too_many_attempts") {
                return res.status(429).json({
                    success: false,
                    message: "Too many incorrect codes. Please wait 20 minutes before trying again."
                });
            }

            return res.status(400).json({
                success: false,
                message: "The login code is invalid or expired. Check the code or request a new one."
            });
        }

        const user = await get(
            `SELECT
                id,
                business_id,
                full_name,
                email,
                role,
                email_verified
             FROM users
             WHERE id = $1`,
            [verification.userId]
        );

        if (!user || Number(user.email_verified) !== 1) {
            return res.status(403).json({
                success: false,
                message: "This account is not verified or is no longer available."
            });
        }

        if (!req.session) {
            return res.status(500).json({
                success: false,
                message: "Secure session service is unavailable. Please try again."
            });
        }

        await regenerateSession(req);

        req.session.user = {
            id: Number(user.id),
            business_id: Number(user.business_id),
            full_name: user.full_name,
            email: user.email,
            role: user.role
        };

        await saveSession(req);

        await recordSecurityEvent(
            user.id,
            user.email,
            "login_confirmed",
            req
        );

        return res.json({
            success: true,
            message: "Your login has been confirmed successfully."
        });
    } catch (error) {
        console.error(
            "Login confirmation error:",
            error.message
        );

        return res.status(500).json({
            success: false,
            message: "Login confirmation could not be completed. Please try again."
        });
    }
});

// CHECK CURRENT SESSION AND BUSINESS NAME
router.get("/me", async (req, res) => {
    try {
        if (!req.session || !req.session.user) {
            return res.status(401).json({
                success: false,
                message: "You are not logged in."
            });
        }

        const userId = req.session.user.id;
        const businessId = req.session.user.business_id;

        const user = await get(
            `SELECT
                users.id,
                users.business_id,
                users.full_name,
                users.email,
                users.role,
                users.email_verified,
                businesses.business_name
             FROM users
             INNER JOIN businesses
                ON users.business_id = businesses.id
             WHERE users.id = $1
             AND users.business_id = $2`,
            [userId, businessId]
        );

        if (!user) {
            return res.status(401).json({
                success: false,
                message: "Account not found."
            });
        }

        if (Number(user.email_verified) !== 1) {
            return res.status(403).json({
                success: false,
                message: "Please verify your email address."
            });
        }

        return res.json({
            success: true,
            user
        });
    } catch (error) {
        console.error(
            "Account information error:",
            error.message
        );

        return res.status(500).json({
            success: false,
            message: "Could not load account information."
        });
    }
});

// LOGOUT
router.post("/logout", async (req, res) => {
    try {
        await destroySession(req);

        res.clearCookie("win.sid", {
            httpOnly: true,
            secure: process.env.NODE_ENV === "production",
            sameSite: "lax"
        });

        return res.json({
            success: true,
            message: "Logged out successfully."
        });
    } catch (error) {
        console.error("Logout error:", error.message);

        return res.status(500).json({
            success: false,
            message: "Could not log out."
        });
    }
});

module.exports = router;
