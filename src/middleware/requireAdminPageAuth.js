"use strict";

const crypto = require("crypto");
const pool = require("../config/postgresDatabase");

const ADMIN_COOKIE_NAME = "win.admin.sid";

async function run(sql, params = []) {
    return pool.query(sql, params);
}

async function get(sql, params = []) {
    const result = await pool.query(sql, params);
    return result.rows[0] || null;
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

function redirectToAdminLogin(res) {
    clearAdminCookie(res);
    return res.redirect(302, "/admin/login.html");
}

async function requireAdminPageAuth(req, res, next) {
    // The Admin login page must remain publicly accessible.
    // When mounted at /admin, Express exposes this as /login.html.
    if (req.path === "/login.html") {
        return next();
    }

    if (req.method !== "GET" && req.method !== "HEAD") {
        return res.status(405).send("Method not allowed.");
    }

    try {
        const rawToken = getAdminCookie(req);

        if (
            typeof rawToken !== "string" ||
            !/^[a-f0-9]{64}$/i.test(rawToken)
        ) {
            return redirectToAdminLogin(res);
        }

        const sessionHash = crypto
            .createHash("sha256")
            .update(rawToken)
            .digest("hex");

        const admin = await get(
            `SELECT
                admins.id,
                admins.full_name,
                admins.email,
                admins.role,
                admins.status
             FROM admin_sessions AS sessions
             INNER JOIN admin_users AS admins
                ON admins.id = sessions.admin_user_id
             WHERE sessions.session_id_hash = $1
               AND sessions.revoked_at IS NULL
               AND sessions.expires_at > CURRENT_TIMESTAMP
               AND admins.status = 'active'
             LIMIT 1`,
            [sessionHash]
        );

        if (!admin) {
            return redirectToAdminLogin(res);
        }

        await run(
            `UPDATE admin_sessions
             SET last_seen_at = CURRENT_TIMESTAMP
             WHERE session_id_hash = $1
               AND revoked_at IS NULL`,
            [sessionHash]
        );

        req.adminUser = {
            id: admin.id,
            full_name: admin.full_name,
            email: admin.email,
            role: admin.role,
            status: admin.status
        };

        return next();

    } catch (error) {
        console.error(
            "Admin page authentication error:",
            error.message
        );

        return res.status(503).send(
            "WIN Admin is temporarily unavailable. Please try again later."
        );
    }
}

module.exports = requireAdminPageAuth;