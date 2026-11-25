
"use strict";

const express = require("express");
const pool = require("../config/postgresDatabase");
const requireAuth = require("../middleware/requireAuth");

const router = express.Router();

router.use(requireAuth);

async function get(sql, params = []) {
    const result = await pool.query(sql, params);
    return result.rows[0] || null;
}

async function all(sql, params = []) {
    const result = await pool.query(sql, params);
    return result.rows;
}

async function run(sql, params = []) {
    const result = await pool.query(sql, params);

    return {
        changes: result.rowCount,
        rows: result.rows
    };
}

function getUserId(req) {
    return req.session.user.id;
}

function getPagination(req) {
    const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
    const limit = Math.max(
        1,
        Math.min(50, Number.parseInt(req.query.limit, 10) || 20)
    );

    return {
        page,
        limit,
        offset: (page - 1) * limit
    };
}

function isValidDate(value) {
    if (typeof value !== "string") return false;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;

    const [year, month, day] = value.split("-").map(Number);
    const date = new Date(Date.UTC(year, month - 1, day));

    return (
        date.getUTCFullYear() === year &&
        date.getUTCMonth() === month - 1 &&
        date.getUTCDate() === day
    );
}

function getDateRange(req, res) {
    const from = req.query.dateFrom || "";
    const to = req.query.dateTo || "";

    if (
        (from && !isValidDate(from)) ||
        (to && !isValidDate(to))
    ) {
        res.status(400).json({
            success: false,
            message: "Please provide valid dates."
        });
        return null;
    }

    if (from && to && from > to) {
        res.status(400).json({
            success: false,
            message: "The start date cannot be after the end date."
        });
        return null;
    }

    return { from, to };
}

function addDateConditions(conditions, params, range) {
    if (range.from) {
        params.push(range.from);
        conditions.push(
            `created_at >= ($${params.length}::date::timestamp - INTERVAL '3 hours')`
        );
    }

    if (range.to) {
        params.push(range.to);
        conditions.push(
            `created_at < (($${params.length}::date + 1)::timestamp - INTERVAL '3 hours')`
        );
    }
}

// GET ALL NOTIFICATIONS IN ONE INBOX
router.get("/", async (req, res) => {
    try {
        const dateRange = getDateRange(req, res);
        if (!dateRange) return;

        const userId = getUserId(req);
        const { page, limit, offset } = getPagination(req);

        const conditions = ["user_id = $1"];
        const params = [userId];

        addDateConditions(conditions, params, dateRange);

        const whereClause = conditions.join(" AND ");

        const paginationParams = [...params, limit, offset];
        const limitPlaceholder = `$${params.length + 1}`;
        const offsetPlaceholder = `$${params.length + 2}`;

        const notifications = await all(
            `SELECT
                id,
                category,
                title,
                message,
                action_label,
                action_url,
                read_at,
                created_at
             FROM user_notifications
             WHERE ${whereClause}
             ORDER BY created_at DESC, id DESC
             LIMIT ${limitPlaceholder} OFFSET ${offsetPlaceholder}`,
            paginationParams
        );

        const counts = await get(
            `SELECT
                COUNT(*) AS total,
                COUNT(*) FILTER (WHERE read_at IS NULL) AS unread,
                COUNT(*) FILTER (WHERE read_at IS NOT NULL) AS read
             FROM user_notifications
             WHERE ${whereClause}`,
            params
        );

        const total = Number(counts.total || 0);

        return res.json({
            success: true,
            notifications,
            counts: {
                total,
                unread: Number(counts.unread || 0),
                read: Number(counts.read || 0)
            },
            pagination: {
                page,
                limit,
                total,
                totalPages: Math.ceil(total / limit)
            }
        });

    } catch (error) {
        console.error("Notification lookup error:", error.message);

        return res.status(500).json({
            success: false,
            message: "Could not load your notifications."
        });
    }
});

// GET UNREAD COUNT FOR THE DASHBOARD BELL
router.get("/unread-count", async (req, res) => {
    try {
        const result = await get(
            `SELECT COUNT(*) AS unread_count
             FROM user_notifications
             WHERE user_id = $1
               AND read_at IS NULL`,
            [getUserId(req)]
        );

        return res.json({
            success: true,
            unread_count: Number(result.unread_count || 0)
        });

    } catch (error) {
        console.error("Unread count error:", error.message);

        return res.status(500).json({
            success: false,
            message: "Could not load your notification count."
        });
    }
});

// CLAIM NEXT ONE-TIME POPUP
router.post("/popup-queue/claim", async (req, res) => {
    try {
        const userId = getUserId(req);

        const popup = await get(
            `UPDATE user_notifications
             SET popup_shown_at = CURRENT_TIMESTAMP
             WHERE id = (
                 SELECT id
                 FROM user_notifications
                 WHERE user_id = $1
                   AND read_at IS NULL
                   AND popup_shown_at IS NULL
                   AND popup_dismissed_at IS NULL
                 ORDER BY created_at ASC, id ASC
                 LIMIT 1
                 FOR UPDATE
             )
               AND user_id = $1
               AND popup_shown_at IS NULL
             RETURNING
                id,
                category,
                title,
                message,
                action_label,
                action_url,
                created_at`,
            [userId]
        );

        return res.json({
            success: true,
            popup: popup || null
        });

    } catch (error) {
        console.error("Popup queue error:", error.message);

        return res.status(500).json({
            success: false,
            message: "Could not load your next notification."
        });
    }
});

// CLOSE POPUP WITH X WITHOUT MARKING AS READ
router.patch("/:id/popup-dismiss", async (req, res) => {
    try {
        const notificationId = Number.parseInt(req.params.id, 10);
        const userId = getUserId(req);

        if (!Number.isSafeInteger(notificationId) || notificationId <= 0) {
            return res.status(400).json({
                success: false,
                message: "Invalid notification ID."
            });
        }

        const result = await run(
            `UPDATE user_notifications
             SET popup_dismissed_at = CURRENT_TIMESTAMP
             WHERE id = $1
               AND user_id = $2
               AND popup_shown_at IS NOT NULL
               AND popup_dismissed_at IS NULL
               AND read_at IS NULL`,
            [notificationId, userId]
        );

        if (result.changes === 0) {
            const notification = await get(
                `SELECT id FROM user_notifications
                 WHERE id = $1 AND user_id = $2`,
                [notificationId, userId]
            );

            if (!notification) {
                return res.status(404).json({
                    success: false,
                    message: "Notification not found."
                });
            }
        }

        return res.json({
            success: true,
            message: "Popup closed. Notification remains in your inbox."
        });

    } catch (error) {
        console.error("Popup dismissal error:", error.message);

        return res.status(500).json({
            success: false,
            message: "Could not close the notification popup."
        });
    }
});

// MARK ONE NOTIFICATION AS READ
router.patch("/:id/read", async (req, res) => {
    try {
        const notificationId = Number.parseInt(req.params.id, 10);
        const userId = getUserId(req);

        if (!Number.isSafeInteger(notificationId) || notificationId <= 0) {
            return res.status(400).json({
                success: false,
                message: "Invalid notification ID."
            });
        }

        const result = await run(
            `UPDATE user_notifications
             SET
                read_at = COALESCE(read_at, CURRENT_TIMESTAMP),
                popup_dismissed_at = COALESCE(
                    popup_dismissed_at,
                    CURRENT_TIMESTAMP
                )
             WHERE id = $1 AND user_id = $2`,
            [notificationId, userId]
        );

        if (result.changes === 0) {
            const notification = await get(
                `SELECT id FROM user_notifications
                 WHERE id = $1 AND user_id = $2`,
                [notificationId, userId]
            );

            if (!notification) {
                return res.status(404).json({
                    success: false,
                    message: "Notification not found."
                });
            }
        }

        return res.json({
            success: true,
            message: "Notification marked as read."
        });

    } catch (error) {
        console.error("Mark notification read error:", error.message);

        return res.status(500).json({
            success: false,
            message: "Could not update your notification."
        });
    }
});

// MARK ALL NOTIFICATIONS AS READ
router.post("/read-all", async (req, res) => {
    try {
        const result = await run(
            `UPDATE user_notifications
             SET
                read_at = CURRENT_TIMESTAMP,
                popup_dismissed_at = COALESCE(
                    popup_dismissed_at,
                    CURRENT_TIMESTAMP
                )
             WHERE user_id = $1
               AND read_at IS NULL`,
            [getUserId(req)]
        );

        return res.json({
            success: true,
            updated: result.changes,
            message: "All notifications have been marked as read."
        });

    } catch (error) {
        console.error("Mark all notifications error:", error.message);

        return res.status(500).json({
            success: false,
            message: "Could not mark all notifications as read."
        });
    }
});

module.exports = router;
