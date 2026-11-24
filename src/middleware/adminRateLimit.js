
"use strict";

const { checkLimit } = require("../services/emailRateLimitService");

const ADMIN_LOGIN_LIMITS = {
    ip: {
        maxRequests: 10,
        windowMinutes: 15,
        blockMinutes: 15
    },

    email: {
        maxRequests: 5,
        windowMinutes: 15,
        blockMinutes: 15
    }
};

async function adminRateLimit(req, res, next) {
    // Protect only the administrator login endpoint.
    if (req.method !== "POST" || req.path !== "/login") {
        return next();
    }

    const email =
        typeof req.body?.email === "string"
            ? req.body.email.trim().toLowerCase()
            : "";

    const identifiers = [
        {
            value: req.ip || "unknown",
            action: "admin_login:ip",
            config: ADMIN_LOGIN_LIMITS.ip
        }
    ];

    if (email) {
        identifiers.push({
            value: email,
            action: "admin_login:email",
            config: ADMIN_LOGIN_LIMITS.email
        });
    }

    try {
        for (const item of identifiers) {
            const result = await checkLimit({
                identifier: item.value,
                action: item.action,
                ...item.config
            });

            if (!result.allowed) {
                res.set(
                    "Retry-After",
                    String(result.retryAfterSeconds)
                );

                return res.status(429).json({
                    success: false,
                    message: "Too many administrator login attempts. Please wait before trying again.",
                    retryAfterSeconds: result.retryAfterSeconds
                });
            }
        }

        return next();

    } catch (error) {
        console.error(
            "Admin login rate-limit error:",
            error.message
        );

        // Fail closed if the security check cannot be completed.
        return res.status(503).json({
            success: false,
            message: "Administrator login is temporarily unavailable. Please try again later."
        });
    }
}

module.exports = adminRateLimit;
