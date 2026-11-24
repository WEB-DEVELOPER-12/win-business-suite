
const { checkLimit } = require("../services/emailRateLimitService");

const LIMITS = {
    "/register": {
        ip: {
            maxRequests: 5,
            windowMinutes: 60,
            blockMinutes: 60
        }
    },
    "/login": {
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
    },
    "/resend-verification": {
        ip: {
            maxRequests: 3,
            windowMinutes: 15,
            blockMinutes: 30
        },
        email: {
            maxRequests: 3,
            windowMinutes: 15,
            blockMinutes: 30
        }
    },
    "/verify-email": {
        ip: {
            maxRequests: 10,
            windowMinutes: 15,
            blockMinutes: 15
        }
    },
    "/confirm-login": {
        ip: {
            maxRequests: 10,
            windowMinutes: 15,
            blockMinutes: 15
        }
    }
};

async function emailRateLimit(req, res, next) {
    if (req.method !== "POST") {
        return next();
    }

    const routeLimits = LIMITS[req.path];

    if (!routeLimits) {
        return next();
    }

    const identifiers = [
        {
            value: req.ip || "unknown",
            action: `${req.path}:ip`,
            config: routeLimits.ip
        }
    ];

    const email = req.body && typeof req.body.email === "string"
        ? req.body.email.trim().toLowerCase()
        : "";

    if (email && routeLimits.email) {
        identifiers.push({
            value: email,
            action: `${req.path}:email`,
            config: routeLimits.email
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
                    message: "Too many requests. Please wait before trying again.",
                    retryAfterSeconds: result.retryAfterSeconds
                });
            }
        }

        return next();
    } catch (error) {
        console.error("Email rate-limit check failed:", error.message);

        // Fail closed when the security check cannot be completed.
        return res.status(503).json({
            success: false,
            message: "We cannot process this request securely right now. Please try again later."
        });
    }
}

module.exports = emailRateLimit;
