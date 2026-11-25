"use strict";

const pool = require("../config/postgresDatabase");

const ALLOWED_CATEGORIES = [
    "general",
    "maintenance",
    "welcome",
    "subscription",
    "security",
    "payment",
    "feature_update",
    "service_status",
    "platform_announcement",
    "policy_update"
];

const ALLOWED_IMPORTANCE = [
    "critical",
    "high",
    "medium",
    "low"
];

function validateNotification(notification) {
    if (!notification || typeof notification !== "object") {
        throw new Error("A notification is required.");
    }

    if (!ALLOWED_CATEGORIES.includes(notification.category)) {
        throw new Error("Invalid notification category.");
    }

    if (!ALLOWED_IMPORTANCE.includes(notification.importance || "medium")) {
        throw new Error("Invalid notification importance.");
    }

    if (
        typeof notification.title !== "string" ||
        !notification.title.trim() ||
        notification.title.length > 150
    ) {
        throw new Error("Notification title must contain 1 to 150 characters.");
    }

    if (
        typeof notification.message !== "string" ||
        !notification.message.trim() ||
        notification.message.length > 5000
    ) {
        throw new Error("Notification message must contain 1 to 5000 characters.");
    }

    if (
        notification.actionUrl &&
        (
            typeof notification.actionUrl !== "string" ||
            !notification.actionUrl.startsWith("/") ||
            notification.actionUrl.startsWith("//")
        )
    ) {
        throw new Error("Notification action URLs must be internal website paths.");
    }
}

async function createUserNotification(userId, notification) {
    if (!Number.isSafeInteger(Number(userId)) || Number(userId) <= 0) {
        throw new Error("A valid user ID is required.");
    }

    validateNotification(notification);

    const result = await pool.query(
        `INSERT INTO user_notifications (
            user_id,
            category,
            title,
            message,
            importance,
            action_label,
            action_url,
            is_permanent,
            dedupe_key,
            expires_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        ON CONFLICT (user_id, dedupe_key) DO NOTHING`,
        [
            Number(userId),
            notification.category,
            notification.title.trim(),
            notification.message.trim(),
            notification.importance || "medium",
            notification.actionLabel || null,
            notification.actionUrl || null,
            notification.isPermanent ? 1 : 0,
            notification.dedupeKey || null,
            notification.isPermanent ? null : (notification.expiresAt || null)
        ]
    );

    return {
        success: true,
        created: result.rowCount === 1
    };
}

async function notifyBusinessUsers(businessId, notification) {
    if (!Number.isSafeInteger(Number(businessId)) || Number(businessId) <= 0) {
        throw new Error("A valid business ID is required.");
    }

    validateNotification(notification);

    const result = await pool.query(
        `INSERT INTO user_notifications (
            user_id,
            category,
            title,
            message,
            importance,
            action_label,
            action_url,
            is_permanent,
            dedupe_key,
            expires_at
        )
        SELECT
            id,
            $1, $2, $3, $4, $5, $6, $7, $8, $9
        FROM users
        WHERE business_id = $10
        ON CONFLICT (user_id, dedupe_key) DO NOTHING`,
        [
            notification.category,
            notification.title.trim(),
            notification.message.trim(),
            notification.importance || "medium",
            notification.actionLabel || null,
            notification.actionUrl || null,
            notification.isPermanent ? 1 : 0,
            notification.dedupeKey || null,
            notification.isPermanent ? null : (notification.expiresAt || null),
            Number(businessId)
        ]
    );

    return {
        success: true,
        recipients: result.rowCount
    };
}

async function createWelcomeNotification(userId, fullName) {
    const name = String(fullName || "there").trim();

    return createUserNotification(userId, {
        category: "welcome",
        title: "Welcome to WIN Business Suite!",
        message:
            `Hello ${name}, welcome to WIN Business Suite! ` +
            "Your account has been created successfully. " +
            "Verify your email address to complete your account setup. " +
            "You can find this welcome message in your notification history.",
        importance: "medium",
        isPermanent: true,
        dedupeKey: "welcome:account-created:v1",
        actionLabel: "View Login",
        actionUrl: "/login.html"
    });
}

module.exports = {
    createUserNotification,
    notifyBusinessUsers,
    createWelcomeNotification
};