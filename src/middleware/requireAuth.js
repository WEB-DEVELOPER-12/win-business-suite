"use strict";

const pool = require("../config/postgresDatabase");

function clearSessionAndRespond(
    req,
    res,
    statusCode,
    message,
    code = null
) {
    const sendResponse = () => {
        res.clearCookie("win.sid", {
            httpOnly: true,
            secure: process.env.NODE_ENV === "production",
            sameSite: "lax",
            path: "/"
        });

        if (!res.headersSent) {
            const response = {
                success: false,
                message
            };

            if (code) {
                response.code = code;
            }

            res.status(statusCode).json(response);
        }
    };

    if (
        req.session &&
        typeof req.session.destroy === "function"
    ) {
        return req.session.destroy(error => {
            if (error) {
                console.error(
                    "Session cleanup error:",
                    error.message
                );
            }

            sendResponse();
        });
    }

    sendResponse();
}

async function requireAuth(req, res, next) {
    if (!req.session || !req.session.user) {
        return res.status(401).json({
            success: false,
            message: "Please log in to continue."
        });
    }

    const user = req.session.user;

    if (!user.id || !user.business_id) {
        return clearSessionAndRespond(
            req,
            res,
            401,
            "Invalid session. Please log in again."
        );
    }

    try {
        const result = await pool.query(
            `SELECT
                users.email_verified,
                businesses.account_status
             FROM users
             INNER JOIN businesses
                ON businesses.id = users.business_id
             WHERE users.id = $1
               AND users.business_id = $2
             LIMIT 1`,
            [user.id, user.business_id]
        );

        const account = result.rows[0];

        if (!account) {
            return clearSessionAndRespond(
                req,
                res,
                401,
                "Account not found. Please log in again."
            );
        }

        // Suspended businesses cannot use customer APIs.
        // Existing customer sessions are destroyed immediately.
        if (account.account_status === "suspended") {
            return clearSessionAndRespond(
                req,
                res,
                403,
                "Your WIN Business Suite business account has been suspended by platform administration. Please contact WIN Support.",
                "BUSINESS_SUSPENDED"
            );
        }

        if (account.account_status !== "active") {
            return clearSessionAndRespond(
                req,
                res,
                403,
                "Your business account is currently unavailable.",
                "BUSINESS_UNAVAILABLE"
            );
        }

        if (Number(account.email_verified) !== 1) {
            return clearSessionAndRespond(
                req,
                res,
                403,
                "Please verify your email address before accessing your dashboard."
            );
        }

        return next();

    } catch (error) {
        console.error(
            "Authentication check error:",
            error.message
        );

        return res.status(500).json({
            success: false,
            message: "Could not verify your account. Please try again."
        });
    }
}

module.exports = requireAuth;