"use strict";

const express = require("express");
const crypto = require("crypto");
const bcrypt = require("bcryptjs");
const pool = require("../config/postgresDatabase");

const router = express.Router();

async function get(sql, params = []) {
    const result = await pool.query(sql, params);
    return result.rows[0] || null;
}

function clearCustomerSession(req, res, statusCode, message) {
    const sendResponse = () => {
        res.clearCookie("win.sid", {
            httpOnly: true,
            secure: process.env.NODE_ENV === "production",
            sameSite: "lax",
            path: "/"
        });

        if (!res.headersSent) {
            return res.status(statusCode).json({
                success: false,
                code: "BUSINESS_SUSPENDED",
                message
            });
        }
    };

    if (req.session && typeof req.session.destroy === "function") {
        return req.session.destroy(error => {
            if (error) {
                console.error(
                    "Suspended customer session cleanup failed:",
                    error.message
                );
            }

            sendResponse();
        });
    }

    sendResponse();
}

const SUSPENDED_MESSAGE =
    "Your WIN Business Suite business account has been suspended by platform administration. Please contact WIN Support.";

// ==========================================
// LOGIN GUARD
// ==========================================

router.post("/login", async (req, res, next) => {
    try {
        const email = req.body?.email;
        const password = req.body?.password;

        if (
            typeof email !== "string" ||
            typeof password !== "string" ||
            !email.trim() ||
            !password
        ) {
            return next();
        }

        const normalizedEmail = email.trim().toLowerCase();

        const account = await get(
            `SELECT
                users.id,
                users.password_hash,
                businesses.account_status
             FROM users
             INNER JOIN businesses
                ON businesses.id = users.business_id
             WHERE users.email = $1
             LIMIT 1`,
            [normalizedEmail]
        );

        // Let the existing login route handle unknown accounts.
        if (!account || account.account_status !== "suspended") {
            return next();
        }

        // Verify the password before revealing the suspension status.
        const passwordMatches = await bcrypt.compare(
            password,
            account.password_hash
        );

        if (!passwordMatches) {
            return next();
        }

        return res.status(403).json({
            success: false,
            code: "BUSINESS_SUSPENDED",
            message: SUSPENDED_MESSAGE
        });

    } catch (error) {
        console.error(
            "Business login access check failed:",
            error.message
        );

        return res.status(500).json({
            success: false,
            message: "Could not verify your business account. Please try again."
        });
    }
});

// ==========================================
// LOGIN CONFIRMATION GUARD
// ==========================================

router.post("/confirm-login", async (req, res, next) => {
    try {
        const token = req.body?.token;

        if (
            typeof token !== "string" ||
            token.length < 20 ||
            token.length > 200
        ) {
            return next();
        }

        const secret = process.env.EMAIL_VERIFICATION_SECRET;

        if (!secret || secret.length < 32) {
            throw new Error(
                "EMAIL_VERIFICATION_SECRET is missing or too short."
            );
        }

        const tokenHash = crypto
            .createHmac("sha256", secret)
            .update(token)
            .digest("hex");

        // Inspect an unused, unexpired login token without consuming it.
        const account = await get(
            `SELECT
                users.id,
                businesses.account_status
             FROM email_tokens
             INNER JOIN users
                ON users.id = email_tokens.user_id
             INNER JOIN businesses
                ON businesses.id = users.business_id
             WHERE email_tokens.token_hash = $1
               AND email_tokens.purpose = 'login_confirmation'
               AND email_tokens.used_at IS NULL
               AND email_tokens.expires_at > CURRENT_TIMESTAMP
             LIMIT 1`,
            [tokenHash]
        );

        if (!account || account.account_status !== "suspended") {
            return next();
        }

        return res.status(403).json({
            success: false,
            code: "BUSINESS_SUSPENDED",
            message: SUSPENDED_MESSAGE
        });

    } catch (error) {
        console.error(
            "Business login confirmation check failed:",
            error.message
        );

        return res.status(500).json({
            success: false,
            message: "Could not verify your business account. Please try again."
        });
    }
});

// ==========================================
// CURRENT SESSION GUARD
// ==========================================

router.get("/me", async (req, res, next) => {
    try {
        if (!req.session?.user) {
            return next();
        }

        const user = req.session.user;

        if (!user.id || !user.business_id) {
            return next();
        }

        const account = await get(
            `SELECT account_status
             FROM businesses
             WHERE id = $1
             LIMIT 1`,
            [user.business_id]
        );

        if (!account || account.account_status !== "suspended") {
            return next();
        }

        return clearCustomerSession(
            req,
            res,
            403,
            SUSPENDED_MESSAGE
        );

    } catch (error) {
        console.error(
            "Business session access check failed:",
            error.message
        );

        return res.status(500).json({
            success: false,
            message: "Could not verify your business account. Please try again."
        });
    }
});

module.exports = router;