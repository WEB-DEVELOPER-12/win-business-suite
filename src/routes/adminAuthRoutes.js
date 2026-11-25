
"use strict";

const express = require("express");
const bcrypt = require("bcryptjs");
const crypto = require("crypto");

const db = require("../config/postgresRouteDatabase");
const requireAdminAuth = require("../middleware/requireAdminAuth");

const router = express.Router();

const ADMIN_COOKIE_NAME = "win.admin.sid";
const ADMIN_SESSION_HOURS = 8;
const MAX_LOGIN_ATTEMPTS = 5;
const LOCKOUT_MINUTES = 15;

router.use(db.middleware);

router.use((req, res, next) => {
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("Pragma", "no-cache");
    next();
});

function run(sql, params = []) {
    return new Promise((resolve, reject) => {
        db.run(sql, params, function (error) {
            if (error) return reject(error);
            resolve(this);
        });
    });
}

function get(sql, params = []) {
    return new Promise((resolve, reject) => {
        db.get(sql, params, (error, row) => {
            if (error) return reject(error);
            resolve(row || null);
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

function hashSessionToken(token) {
    return crypto
        .createHash("sha256")
        .update(token)
        .digest("hex");
}

function getAdminCookie(req) {
    const cookieHeader = req.headers.cookie || "";

    for (const part of cookieHeader.split(";")) {
        const separator = part.indexOf("=");

        if (separator === -1) continue;

        const name = part.slice(0, separator).trim();
        const value = part.slice(separator + 1).trim();

        if (name !== ADMIN_COOKIE_NAME) continue;

        try {
            return decodeURIComponent(value);
        } catch {
            return null;
        }
    }

    return null;
}

function clearAdminCookie(res) {
    res.clearCookie(ADMIN_COOKIE_NAME, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "strict",
        path: "/"
    });
}

function setAdminCookie(res, token) {
    res.cookie(ADMIN_COOKIE_NAME, token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "strict",
        path: "/",
        maxAge: ADMIN_SESSION_HOURS * 60 * 60 * 1000
    });
}

async function recordSecurityEvent(adminId, email, eventType, req) {
    await run(
        `INSERT INTO admin_security_events (
            admin_user_id,
            email,
            event_type,
            ip_address,
            user_agent
        ) VALUES (?, ?, ?, ?, ?)`,
        [
            adminId || null,
            email || null,
            eventType,
            req.ip || null,
            req.get("user-agent") || null
        ]
    );
}

async function recordActivity(
    adminId,
    action,
    targetType,
    targetId,
    details,
    req
) {
    await run(
        `INSERT INTO admin_activity_logs (
            admin_user_id,
            action,
            target_type,
            target_id,
            details_json,
            ip_address,
            user_agent
        ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
            adminId,
            action,
            targetType || null,
            targetId || null,
            JSON.stringify(details || {}),
            req.ip || null,
            req.get("user-agent") || null
        ]
    );
}

function invalidLoginResponse(res) {
    return res.status(401).json({
        success: false,
        message: "Invalid administrator email or password."
    });
}

// ADMIN LOGIN
router.post("/login", async (req, res) => {
    const email =
        typeof req.body?.email === "string"
            ? req.body.email.trim().toLowerCase()
            : "";

    const password =
        typeof req.body?.password === "string"
            ? req.body.password
            : "";

    if (
        !email ||
        email.length > 254 ||
        !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
        !password ||
        Buffer.byteLength(password, "utf8") > 72
    ) {
        return invalidLoginResponse(res);
    }

    try {
        const admin = await get(
            `SELECT
                id,
                full_name,
                email,
                password_hash,
                role,
                status,
                failed_login_attempts,
                locked_until,
                CASE
                    WHEN locked_until IS NOT NULL
                     AND locked_until > CURRENT_TIMESTAMP
                    THEN 1
                    ELSE 0
                END AS is_locked
             FROM admin_users
             WHERE email = ?
             LIMIT 1`,
            [email]
        );

        if (!admin) {
            await recordSecurityEvent(
                null,
                email,
                "admin_login_failed",
                req
            );

            return invalidLoginResponse(res);
        }

        if (admin.status !== "active") {
            await recordSecurityEvent(
                admin.id,
                admin.email,
                "admin_login_blocked_inactive",
                req
            );

            return res.status(403).json({
                success: false,
                message: "This administrator account is unavailable."
            });
        }

        if (Number(admin.is_locked) === 1) {
            await recordSecurityEvent(
                admin.id,
                admin.email,
                "admin_login_blocked_locked",
                req
            );

            return res.status(429).json({
                success: false,
                message: "Too many unsuccessful attempts. Please try again later."
            });
        }

        const passwordMatches = await bcrypt.compare(
            password,
            admin.password_hash
        );

        if (!passwordMatches) {
            await run(
                `UPDATE admin_users
                 SET
                    failed_login_attempts =
                        CASE
                            WHEN locked_until IS NOT NULL
                             AND locked_until <= CURRENT_TIMESTAMP
                            THEN 1
                            ELSE failed_login_attempts + 1
                        END,

                    locked_until =
                        CASE
                            WHEN (
                                CASE
                                    WHEN locked_until IS NOT NULL
                                     AND locked_until <= CURRENT_TIMESTAMP
                                    THEN 1
                                    ELSE failed_login_attempts + 1
                                END
                            ) >= ?
                            THEN CURRENT_TIMESTAMP + (? * INTERVAL '1 minute')
                            ELSE NULL
                        END,

                    updated_at = CURRENT_TIMESTAMP
                 WHERE id = ?`,
                [
                    MAX_LOGIN_ATTEMPTS,
                    LOCKOUT_MINUTES,
                    admin.id
                ]
            );

            const updatedAdmin = await get(
                `SELECT failed_login_attempts, locked_until
                 FROM admin_users
                 WHERE id = ?`,
                [admin.id]
            );

            const locked =
                updatedAdmin &&
                updatedAdmin.locked_until !== null &&
                Number(updatedAdmin.failed_login_attempts) >= MAX_LOGIN_ATTEMPTS;

            await recordSecurityEvent(
                admin.id,
                admin.email,
                locked
                    ? "admin_account_temporarily_locked"
                    : "admin_login_failed",
                req
            );

            if (locked) {
                return res.status(429).json({
                    success: false,
                    message: "Too many unsuccessful attempts. Your account is temporarily locked for 15 minutes."
                });
            }

            return invalidLoginResponse(res);
        }

        const rawToken = crypto.randomBytes(32).toString("hex");
        const sessionHash = hashSessionToken(rawToken);

        const previousToken = getAdminCookie(req);

        const previousSessionHash =
            previousToken &&
            /^[a-f0-9]{64}$/i.test(previousToken)
                ? hashSessionToken(previousToken)
                : null;

        await run("BEGIN");

        try {
            // Revoke a previous administrator session in this browser.
            if (previousSessionHash) {
                await run(
                    `UPDATE admin_sessions
                     SET revoked_at = CURRENT_TIMESTAMP
                     WHERE session_id_hash = ?
                       AND revoked_at IS NULL`,
                    [previousSessionHash]
                );
            }

            // Store only the hash of the browser's session token.
            await run(
                `INSERT INTO admin_sessions (
                    session_id_hash,
                    admin_user_id,
                    expires_at,
                    ip_address,
                    user_agent
                ) VALUES (
                    ?,
                    ?,
                    CURRENT_TIMESTAMP + INTERVAL '8 hours',
                    ?,
                    ?
                )
                RETURNING session_id_hash`,
                [
                    sessionHash,
                    admin.id,
                    req.ip || null,
                    req.get("user-agent") || null
                ]
            );

            await run(
                `UPDATE admin_users
                 SET
                    failed_login_attempts = 0,
                    locked_until = NULL,
                    last_login_at = CURRENT_TIMESTAMP,
                    last_login_ip = ?,
                    updated_at = CURRENT_TIMESTAMP
                 WHERE id = ?`,
                [req.ip || null, admin.id]
            );

            await recordSecurityEvent(
                admin.id,
                admin.email,
                "admin_login_success",
                req
            );

            await recordActivity(
                admin.id,
                "admin_login",
                "admin_user",
                String(admin.id),
                { role: admin.role },
                req
            );

            await run("COMMIT");
        } catch (transactionError) {
            try {
                await run("ROLLBACK");
            } catch (rollbackError) {
                console.error(
                    "Admin login rollback error:",
                    rollbackError.message
                );
            }

            throw transactionError;
        }

        // Issue the separate administrator cookie only after
        // the database session has been saved successfully.
        setAdminCookie(res, rawToken);

        return res.json({
            success: true,
            message: "Administrator login successful.",
            admin: {
                id: admin.id,
                full_name: admin.full_name,
                email: admin.email,
                role: admin.role
            },
            redirect: "/admin/dashboard.html"
        });

    } catch (error) {
        console.error("Admin login error:", error.message);

        clearAdminCookie(res);

        return res.status(500).json({
            success: false,
            message: "Administrator login could not be completed."
        });
    }
});

// GET CURRENT ADMINISTRATOR
router.get("/me", requireAdminAuth, (req, res) => {
    return res.json({
        success: true,
        admin: req.adminUser,
        permissions: [...req.adminPermissions].sort()
    });
});

// ADMIN LOGOUT
router.post("/logout", async (req, res) => {
    try {
        const rawToken = getAdminCookie(req);

        if (
            typeof rawToken === "string" &&
            /^[a-f0-9]{64}$/i.test(rawToken)
        ) {
            const sessionHash = hashSessionToken(rawToken);

            const session = await get(
                `SELECT admin_user_id
                 FROM admin_sessions
                 WHERE session_id_hash = ?
                   AND revoked_at IS NULL`,
                [sessionHash]
            );

            if (session) {
                await run(
                    `UPDATE admin_sessions
                     SET revoked_at = CURRENT_TIMESTAMP
                     WHERE session_id_hash = ?`,
                    [sessionHash]
                );

                await recordSecurityEvent(
                    session.admin_user_id,
                    null,
                    "admin_logout",
                    req
                );

                await recordActivity(
                    session.admin_user_id,
                    "admin_logout",
                    "admin_user",
                    String(session.admin_user_id),
                    {},
                    req
                );
            }
        }

        clearAdminCookie(res);

        return res.json({
            success: true,
            message: "Administrator logged out successfully."
        });

    } catch (error) {
        console.error("Admin logout error:", error.message);

        clearAdminCookie(res);

        return res.status(500).json({
            success: false,
            message: "Could not complete administrator logout."
        });
    }
});

module.exports = router;
