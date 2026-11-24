"use strict";

const crypto = require("crypto");
const pool = require("../config/postgresDatabase");

const ADMIN_COOKIE_NAME = "win.admin.sid";

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

async function get(sql, params = []) {
    const result = await pool.query(sql, params);
    return result.rows[0] || null;
}

async function all(sql, params = []) {
    const result = await pool.query(sql, params);
    return result.rows;
}

async function run(sql, params = []) {
    return pool.query(sql, params);
}

function rejectAdmin(res) {
    clearAdminCookie(res);

    return res.status(401).json({
        success: false,
        message: "Administrator authentication is required."
    });
}

async function requireAdminAuth(req, res, next) {
    try {
        const sessionToken = getAdminCookie(req);

        if (
            typeof sessionToken !== "string" ||
            !/^[a-f0-9]{64}$/i.test(sessionToken)
        ) {
            return rejectAdmin(res);
        }

        // The browser holds the random token.
        // Only its SHA-256 hash is stored in the database.
        const sessionHash = crypto
            .createHash("sha256")
            .update(sessionToken)
            .digest("hex");

        const admin = await get(
            `SELECT
                admins.id,
                admins.full_name,
                admins.email,
                admins.role,
                admins.status,
                sessions.expires_at
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
            return rejectAdmin(res);
        }

        const permissionRows = await all(
            `SELECT permission
             FROM admin_role_permissions
             WHERE role = $1`,
            [admin.role]
        );

        const permissions = new Set(
            permissionRows.map(row => row.permission)
        );

        // Update the session's last activity time.
        await run(
            `UPDATE admin_sessions
             SET last_seen_at = CURRENT_TIMESTAMP
             WHERE session_id_hash = $1
               AND revoked_at IS NULL`,
            [sessionHash]
        );

        // These properties are available to protected Admin routes.
        req.adminUser = {
            id: admin.id,
            full_name: admin.full_name,
            email: admin.email,
            role: admin.role,
            status: admin.status
        };

        req.adminPermissions = permissions;

        return next();

    } catch (error) {
        console.error(
            "Admin authentication error:",
            error.message
        );

        return res.status(500).json({
            success: false,
            message: "Could not verify administrator access."
        });
    }
}

module.exports = requireAdminAuth;