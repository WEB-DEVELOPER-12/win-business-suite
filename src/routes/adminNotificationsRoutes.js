
"use strict";

const express = require("express");
const pool = require("../config/postgresDatabase");
const requireAdminAuth = require("../middleware/requireAdminAuth");

const router = express.Router();

router.use(requireAdminAuth);

// ==========================================
// DATABASE HELPERS
// ==========================================

async function get(sql, params = [], client = null) {
    const executor = client || pool;
    const result = await executor.query(sql, params);
    return result.rows[0] || null;
}

async function all(sql, params = [], client = null) {
    const executor = client || pool;
    const result = await executor.query(sql, params);
    return result.rows;
}

async function run(sql, params = [], client = null) {
    const executor = client || pool;
    const result = await executor.query(sql, params);

    return {
        changes: result.rowCount,
        rowCount: result.rowCount,
        lastID: result.rows[0]?.id ?? null,
        rows: result.rows
    };
}

async function withTransaction(callback) {
    const client = await pool.connect();

    try {
        await client.query("BEGIN");

        const result = await callback(client);

        await client.query("COMMIT");

        return result;
    } catch (error) {
        try {
            await client.query("ROLLBACK");
        } catch (rollbackError) {
            console.error(
                "Notification transaction rollback failed:",
                rollbackError.message
            );
        }

        throw error;
    } finally {
        client.release();
    }
}

function hasPermission(req, permission) {
    return req.adminPermissions instanceof Set &&
        req.adminPermissions.has(permission);
}

function parsePositiveInteger(value, fallback, maximum) {
    if (value === undefined) return fallback;

    const parsed = Number(value);

    if (
        !Number.isSafeInteger(parsed) ||
        parsed < 1 ||
        parsed > maximum
    ) {
        return null;
    }

    return parsed;
}

function validateId(value) {
    if (
        typeof value !== "string" ||
        !/^[1-9]\d*$/.test(value)
    ) {
        return null;
    }

    const id = Number(value);
    return Number.isSafeInteger(id) ? id : null;
}

function getRequestMetadata(req) {
    return {
        ipAddress: req?.ip || null,
        userAgent: req?.get("user-agent")
            ? req.get("user-agent").slice(0, 500)
            : null
    };
}

function sendError(res, error, message) {
    console.error(
        "Admin Notifications API error:",
        error.message
    );

    return res.status(500).json({
        success: false,
        message
    });
}

// ==========================================
// INPUT VALIDATION
// ==========================================

const CATEGORIES = {
    maintenance: {
        display: "maintenance",
        database: "maintenance",
        notification: "maintenance"
    },
    announcements: {
        display: "announcements",
        database: "platform_announcement",
        notification: "platform_announcement"
    },
    welcome: {
        display: "welcome",
        database: "general",
        notification: "welcome"
    },
    subscription: {
        display: "subscription",
        database: "subscription",
        notification: "subscription"
    },
    general: {
        display: "general",
        database: "general",
        notification: "general"
    }
};

const AUDIENCES = [
    "all",
    "trial",
    "active",
    "pending",
    "selected_users",
    "business_type"
];

function parseBoolean(value, fallback = false) {
    if (value === undefined || value === null) {
        return fallback;
    }

    if (value === true || value === 1 || value === "1") {
        return true;
    }

    if (value === false || value === 0 || value === "0") {
        return false;
    }

    return null;
}

function validateDate(value, fieldName, res) {
    if (value === undefined || value === null || value === "") {
        return null;
    }

    if (typeof value !== "string") {
        res.status(400).json({
            success: false,
            message: `Invalid ${fieldName}.`
        });

        return undefined;
    }

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
        res.status(400).json({
            success: false,
            message: `Invalid ${fieldName}.`
        });

        return undefined;
    }

    return date.toISOString();
}

function validateCampaign(body, res) {
    const category = CATEGORIES[body.category];

    if (!category) {
        res.status(400).json({
            success: false,
            message: "Choose one of the five supported notification categories."
        });

        return null;
    }

    if (
        typeof body.title !== "string" ||
        body.title.trim().length < 3 ||
        body.title.trim().length > 100
    ) {
        res.status(400).json({
            success: false,
            message: "The title must contain between 3 and 100 characters."
        });

        return null;
    }

    if (
        typeof body.message !== "string" ||
        body.message.trim().length < 5 ||
        body.message.trim().length > 2000
    ) {
        res.status(400).json({
            success: false,
            message: "The message must contain between 5 and 2,000 characters."
        });

        return null;
    }

    const audienceType = body.audienceType || "all";

    if (!AUDIENCES.includes(audienceType)) {
        res.status(400).json({
            success: false,
            message: "Invalid notification audience."
        });

        return null;
    }

    let audienceValue = null;

    if (audienceType === "selected_users") {
        let ids = body.selectedUserIds;

        if (
            !Array.isArray(ids) &&
            typeof body.audienceValue === "string"
        ) {
            try {
                ids = JSON.parse(body.audienceValue);
            } catch {
                ids = null;
            }
        }

        if (
            !Array.isArray(ids) ||
            ids.length < 1 ||
            ids.length > 500
        ) {
            res.status(400).json({
                success: false,
                message: "Select between 1 and 500 valid user accounts."
            });

            return null;
        }

        const cleanIds = [...new Set(ids.map(Number))];

        if (
            cleanIds.some(id =>
                !Number.isSafeInteger(id) || id < 1
            )
        ) {
            res.status(400).json({
                success: false,
                message: "One or more selected user IDs are invalid."
            });

            return null;
        }

        audienceValue = JSON.stringify(cleanIds);
    }

    if (audienceType === "business_type") {
        if (
            typeof body.audienceValue !== "string" ||
            !body.audienceValue.trim() ||
            body.audienceValue.trim().length > 100
        ) {
            res.status(400).json({
                success: false,
                message: "Choose a valid business type."
            });

            return null;
        }

        audienceValue = body.audienceValue.trim();
    }

    const isPermanent = parseBoolean(body.isPermanent, false);

    if (isPermanent === null) {
        res.status(400).json({
            success: false,
            message: "Invalid permanent notification setting."
        });

        return null;
    }

    const expiresAt = isPermanent
        ? null
        : validateDate(body.expiresAt, "expiry date", res);

    if (expiresAt === undefined) return null;

    return {
        category: category.database,
        displayCategory: category.display,
        notificationCategory: category.notification,
        title: body.title.trim(),
        message: body.message.trim(),
        audienceType,
        audienceValue,
        isPermanent: isPermanent ? 1 : 0,
        expiresAt
    };
}

// ==========================================
// AUDIENCE QUERY
// ==========================================

function buildAudienceQuery(
    audienceType,
    audienceValue,
    offset = 0
) {
    const parameter = number => `$${number + offset}`;

    if (audienceType === "all") {
        return {
            sql: `
                SELECT id AS user_id
                FROM users
            `,
            params: []
        };
    }

    if (
        audienceType === "trial" ||
        audienceType === "active" ||
        audienceType === "pending"
    ) {
        return {
            sql: `
                SELECT DISTINCT u.id AS user_id
                FROM users AS u
                INNER JOIN subscriptions AS s
                    ON s.business_id = u.business_id
                WHERE s.status = ${parameter(1)}
            `,
            params: [audienceType]
        };
    }

    if (audienceType === "business_type") {
        return {
            sql: `
                SELECT DISTINCT u.id AS user_id
                FROM users AS u
                INNER JOIN businesses AS b
                    ON b.id = u.business_id
                WHERE b.business_type = ${parameter(1)}
            `,
            params: [audienceValue]
        };
    }

    if (audienceType === "selected_users") {
        const ids = JSON.parse(audienceValue || "[]");

        if (!ids.length) {
            return {
                sql: "SELECT id AS user_id FROM users WHERE FALSE",
                params: []
            };
        }

        return {
            sql: `
                SELECT id AS user_id
                FROM users
                WHERE id IN (
                    ${ids.map((_, index) => parameter(index + 1)).join(",")}
                )
            `,
            params: ids
        };
    }

    throw new Error("Unsupported notification audience.");
}

async function countAudience(audienceType, audienceValue) {
    const audience = buildAudienceQuery(
        audienceType,
        audienceValue
    );

    const result = await get(
        `
            SELECT COUNT(*) AS total
            FROM (${audience.sql}) AS selected_audience
        `,
        audience.params
    );

    return Number(result?.total || 0);
}

// ==========================================
// AUDIT LOG
// ==========================================

async function recordAudit(
    adminId,
    action,
    targetId,
    details,
    metadata = {},
    client = null
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
        ) VALUES ($1, $2, 'notification', $3, $4, $5, $6)`,
        [
            adminId,
            action,
            String(targetId),
            JSON.stringify(details),
            metadata.ipAddress || null,
            metadata.userAgent || null
        ],
        client
    );
}

// ==========================================
// PUBLISH ANNOUNCEMENT
// ==========================================

async function publishAnnouncement(
    id,
    adminId,
    metadata = {}
) {
    return withTransaction(async client => {
        const campaign = await get(
            `SELECT *
             FROM platform_announcements
             WHERE id = $1
             FOR UPDATE`,
            [id],
            client
        );

        if (!campaign) {
            const error = new Error("Notification campaign not found.");
            error.code = "NOT_FOUND";
            throw error;
        }

        if (campaign.status === "published") {
            const error = new Error(
                "This notification has already been published."
            );
            error.code = "CONFLICT";
            throw error;
        }

        if (
            campaign.status !== "draft" &&
            campaign.status !== "scheduled"
        ) {
            const error = new Error(
                "This notification cannot be published in its current status."
            );
            error.code = "CONFLICT";
            throw error;
        }

        const audience = buildAudienceQuery(
            campaign.audience_type,
            campaign.audience_value,
            7
        );

        const notificationCategory =
            campaign.display_category === "welcome"
                ? "welcome"
                : campaign.display_category === "announcements"
                    ? "platform_announcement"
                    : campaign.category;

        const insertResult = await run(
            `
                INSERT INTO user_notifications (
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
                    audience.user_id,
                    $1,
                    $2,
                    $3,
                    $4,
                    NULL,
                    NULL,
                    $5,
                    'announcement:' || $6,
                    $7
                FROM (${audience.sql}) AS audience
                ON CONFLICT (user_id, dedupe_key) DO NOTHING
            `,
            [
                notificationCategory,
                campaign.title,
                campaign.message,
                campaign.importance || "medium",
                campaign.is_permanent,
                campaign.id,
                campaign.expires_at,
                ...audience.params
            ],
            client
        );

        const updateResult = await run(
            `UPDATE platform_announcements
             SET
                status = 'published',
                published_at = CURRENT_TIMESTAMP,
                publish_at = CURRENT_TIMESTAMP,
                updated_at = CURRENT_TIMESTAMP
             WHERE id = $1
               AND status IN ('draft', 'scheduled')`,
            [id],
            client
        );

        if (updateResult.changes !== 1) {
            const error = new Error(
                "The notification status changed before publishing."
            );
            error.code = "CONFLICT";
            throw error;
        }

        await recordAudit(
            adminId,
            "notification.published",
            id,
            {
                title: campaign.title,
                category: campaign.display_category,
                audienceType: campaign.audience_type,
                recipientsCreated: insertResult.changes
            },
            metadata,
            client
        );

        return {
            campaign,
            recipientsCreated: insertResult.changes
        };
    });
}

// ==========================================
// SCHEDULED NOTIFICATION PROCESSOR
// ==========================================

let schedulerRunning = false;

async function processDueAnnouncements() {
    if (schedulerRunning) return;

    schedulerRunning = true;

    try {
        const dueAnnouncements = await all(`
            SELECT id, created_by
            FROM platform_announcements
            WHERE status = 'scheduled'
              AND publish_at <= CURRENT_TIMESTAMP
            ORDER BY publish_at ASC, id ASC
            LIMIT 50
        `);

        for (const announcement of dueAnnouncements) {
            try {
                await publishAnnouncement(
                    announcement.id,
                    announcement.created_by
                );

                console.log(
                    `Scheduled notification published: ${announcement.id}`
                );

            } catch (error) {
                if (error.code !== "CONFLICT") {
                    console.error(
                        `Scheduled notification ${announcement.id} failed:`,
                        error.message
                    );
                }
            }
        }

    } catch (error) {
        console.error(
            "Scheduled notification processor error:",
            error.message
        );

    } finally {
        schedulerRunning = false;
    }
}

// ==========================================
// GET NOTIFICATION CAMPAIGNS
// ==========================================

router.get("/", async (req, res) => {
    try {
        if (!hasPermission(req, "notifications.view")) {
            return res.status(403).json({
                success: false,
                message: "You do not have permission to view notifications."
            });
        }

        const page = parsePositiveInteger(
            req.query.page,
            1,
            1000000
        );

        const limit = parsePositiveInteger(
            req.query.limit,
            10,
            50
        );

        if (
            page === null ||
            limit === null ||
            ![10, 25, 50].includes(limit)
        ) {
            return res.status(400).json({
                success: false,
                message: "Invalid pagination parameters."
            });
        }

        const offset = (page - 1) * limit;

        const count = await get(
            "SELECT COUNT(*) AS total FROM platform_announcements"
        );

        const campaigns = await all(
            `SELECT
                id,
                category,
                display_category,
                title,
                message,
                importance,
                audience_type,
                audience_value,
                publish_at,
                expires_at,
                is_permanent,
                status,
                created_by,
                published_at,
                created_at,
                updated_at
             FROM platform_announcements
             ORDER BY created_at DESC, id DESC
             LIMIT $1
             OFFSET $2`,
            [limit, offset]
        );

        const total = Number(count?.total || 0);

        return res.json({
            success: true,
            campaigns,
            pagination: {
                page,
                limit,
                total,
                totalPages: Math.ceil(total / limit)
            },
            permissions: {
                canManage: hasPermission(
                    req,
                    "notifications.manage"
                )
            }
        });

    } catch (error) {
        return sendError(
            res,
            error,
            "Could not retrieve notification campaigns."
        );
    }
});

// ==========================================
// GET NOTIFICATION STATISTICS
// ==========================================

router.get("/stats", async (req, res) => {
    try {
        if (!hasPermission(req, "notifications.view")) {
            return res.status(403).json({
                success: false,
                message: "You do not have permission to view notification statistics."
            });
        }

        const notificationStats = await get(`
            SELECT
                COUNT(*) AS total,
                COUNT(*) FILTER (WHERE read_at IS NULL) AS unread,
                COUNT(*) FILTER (WHERE read_at IS NOT NULL) AS read
            FROM user_notifications
        `);

        const campaignStats = await get(`
            SELECT
                COUNT(*) AS total,
                COUNT(*) FILTER (WHERE status = 'draft') AS drafts,
                COUNT(*) FILTER (WHERE status = 'scheduled') AS scheduled,
                COUNT(*) FILTER (WHERE status = 'published') AS published
            FROM platform_announcements
        `);

        return res.json({
            success: true,
            notifications: {
                total: Number(notificationStats?.total || 0),
                unread: Number(notificationStats?.unread || 0),
                read: Number(notificationStats?.read || 0)
            },
            campaigns: {
                total: Number(campaignStats?.total || 0),
                drafts: Number(campaignStats?.drafts || 0),
                scheduled: Number(campaignStats?.scheduled || 0),
                published: Number(campaignStats?.published || 0)
            }
        });

    } catch (error) {
        return sendError(
            res,
            error,
            "Could not retrieve notification statistics."
        );
    }
});

// ==========================================
// GET AUDIENCE OPTIONS
// ==========================================

router.get("/audiences", async (req, res) => {
    try {
        if (!hasPermission(req, "notifications.view")) {
            return res.status(403).json({
                success: false,
                message: "You do not have permission to view notification audiences."
            });
        }

        const businessTypes = await all(`
            SELECT DISTINCT business_type
            FROM businesses
            WHERE business_type IS NOT NULL
              AND TRIM(business_type) != ''
            ORDER BY business_type ASC
        `);

        const audienceCounts = {};

        for (const audienceType of [
            "all",
            "trial",
            "active",
            "pending"
        ]) {
            audienceCounts[audienceType] = await countAudience(
                audienceType,
                null
            );
        }

        return res.json({
            success: true,
            businessTypes: businessTypes.map(
                row => row.business_type
            ),
            counts: audienceCounts
        });

    } catch (error) {
        return sendError(
            res,
            error,
            "Could not retrieve notification audience options."
        );
    }
});

// ==========================================
// PREVIEW NOTIFICATION
// ==========================================

router.post("/preview", async (req, res) => {
    try {
        if (!hasPermission(req, "notifications.manage")) {
            return res.status(403).json({
                success: false,
                message: "You do not have permission to preview notifications."
            });
        }

        const campaign = validateCampaign(req.body || {}, res);
        if (!campaign) return;

        const recipients = await countAudience(
            campaign.audienceType,
            campaign.audienceValue
        );

        return res.json({
            success: true,
            preview: {
                category: campaign.displayCategory,
                title: campaign.title,
                message: campaign.message,
                audienceType: campaign.audienceType,
                recipients,
                isPermanent: campaign.isPermanent === 1,
                expiresAt: campaign.expiresAt
            }
        });

    } catch (error) {
        return sendError(
            res,
            error,
            "Could not preview this notification."
        );
    }
});

// ==========================================
// CREATE DRAFT OR SCHEDULED NOTIFICATION
// ==========================================

router.post("/", async (req, res) => {
    try {
        if (!hasPermission(req, "notifications.manage")) {
            return res.status(403).json({
                success: false,
                message: "You do not have permission to create notifications."
            });
        }

        const campaign = validateCampaign(req.body || {}, res);
        if (!campaign) return;

        const requestedStatus = req.body.status || "draft";

        if (
            requestedStatus !== "draft" &&
            requestedStatus !== "scheduled"
        ) {
            return res.status(400).json({
                success: false,
                message: "New notifications can only be saved as drafts or scheduled."
            });
        }

        let publishAt = null;

        if (requestedStatus === "scheduled") {
            publishAt = validateDate(
                req.body.publishAt,
                "scheduled publication date",
                res
            );

            if (publishAt === undefined) return;

            if (
                !publishAt ||
                new Date(publishAt).getTime() <= Date.now()
            ) {
                return res.status(400).json({
                    success: false,
                    message: "Choose a future date and time for scheduling."
                });
            }
        }

        const adminId = Number(req.adminUser?.id);

        if (!Number.isSafeInteger(adminId) || adminId < 1) {
            return res.status(401).json({
                success: false,
                message: "Administrator authentication is required."
            });
        }

        const metadata = getRequestMetadata(req);

        const campaignId = await withTransaction(async client => {
            const result = await run(
                `INSERT INTO platform_announcements (
                    category,
                    display_category,
                    title,
                    message,
                    importance,
                    audience_type,
                    audience_value,
                    action_label,
                    action_url,
                    publish_at,
                    expires_at,
                    is_permanent,
                    status,
                    created_by
                ) VALUES (
                    $1, $2, $3, $4, 'medium', $5, $6,
                    NULL, NULL, $7, $8, $9, $10, $11
                )
                RETURNING id`,
                [
                    campaign.category,
                    campaign.displayCategory,
                    campaign.title,
                    campaign.message,
                    campaign.audienceType,
                    campaign.audienceValue,
                    publishAt || new Date().toISOString(),
                    campaign.expiresAt,
                    campaign.isPermanent,
                    requestedStatus,
                    adminId
                ],
                client
            );

            const id = result.lastID;

            await recordAudit(
                adminId,
                requestedStatus === "draft"
                    ? "notification.draft_created"
                    : "notification.scheduled",
                id,
                {
                    title: campaign.title,
                    category: campaign.displayCategory,
                    audienceType: campaign.audienceType,
                    status: requestedStatus
                },
                metadata,
                client
            );

            return id;
        });

        const recipients = await countAudience(
            campaign.audienceType,
            campaign.audienceValue
        );

        return res.status(201).json({
            success: true,
            message: requestedStatus === "draft"
                ? "Notification draft saved."
                : "Notification scheduled successfully.",
            campaign: {
                id: campaignId,
                title: campaign.title,
                category: campaign.displayCategory,
                status: requestedStatus,
                recipients
            }
        });

    } catch (error) {
        return sendError(
            res,
            error,
            "Could not save this notification."
        );
    }
});

// ==========================================
// GET SINGLE CAMPAIGN
// ==========================================

router.get("/:id", async (req, res) => {
    try {
        if (!hasPermission(req, "notifications.view")) {
            return res.status(403).json({
                success: false,
                message: "You do not have permission to view notifications."
            });
        }

        const id = validateId(req.params.id);

        if (!id) {
            return res.status(400).json({
                success: false,
                message: "Invalid notification ID."
            });
        }

        const campaign = await get(
            `SELECT *
             FROM platform_announcements
             WHERE id = $1`,
            [id]
        );

        if (!campaign) {
            return res.status(404).json({
                success: false,
                message: "Notification campaign not found."
            });
        }

        return res.json({
            success: true,
            campaign
        });

    } catch (error) {
        return sendError(
            res,
            error,
            "Could not retrieve this notification."
        );
    }
});

// ==========================================
// EDIT DRAFT
// ==========================================

router.patch("/:id", async (req, res) => {
    try {
        if (!hasPermission(req, "notifications.manage")) {
            return res.status(403).json({
                success: false,
                message: "You do not have permission to edit notifications."
            });
        }

        const id = validateId(req.params.id);

        if (!id) {
            return res.status(400).json({
                success: false,
                message: "Invalid notification ID."
            });
        }

        const campaign = validateCampaign(req.body || {}, res);
        if (!campaign) return;

        const adminId = Number(req.adminUser?.id);
        const metadata = getRequestMetadata(req);

        await withTransaction(async client => {
            const result = await run(
                `UPDATE platform_announcements
                 SET
                    category = $1,
                    display_category = $2,
                    title = $3,
                    message = $4,
                    audience_type = $5,
                    audience_value = $6,
                    action_label = NULL,
                    action_url = NULL,
                    expires_at = $7,
                    is_permanent = $8,
                    updated_at = CURRENT_TIMESTAMP
                 WHERE id = $9
                   AND status = 'draft'`,
                [
                    campaign.category,
                    campaign.displayCategory,
                    campaign.title,
                    campaign.message,
                    campaign.audienceType,
                    campaign.audienceValue,
                    campaign.expiresAt,
                    campaign.isPermanent,
                    id
                ],
                client
            );

            if (result.changes !== 1) {
                const error = new Error(
                    "Only existing draft notifications can be edited."
                );

                error.code = "CONFLICT";
                throw error;
            }

            await recordAudit(
                adminId,
                "notification.draft_updated",
                id,
                {
                    title: campaign.title,
                    category: campaign.displayCategory,
                    audienceType: campaign.audienceType
                },
                metadata,
                client
            );
        });

        return res.json({
            success: true,
            message: "Notification draft updated."
        });

    } catch (error) {
        if (error.code === "CONFLICT") {
            return res.status(409).json({
                success: false,
                message: error.message
            });
        }

        return sendError(
            res,
            error,
            "Could not update this notification draft."
        );
    }
});

// ==========================================
// PUBLISH NOW
// ==========================================

router.post("/:id/publish", async (req, res) => {
    try {
        if (!hasPermission(req, "notifications.manage")) {
            return res.status(403).json({
                success: false,
                message: "You do not have permission to publish notifications."
            });
        }

        const id = validateId(req.params.id);

        if (!id) {
            return res.status(400).json({
                success: false,
                message: "Invalid notification ID."
            });
        }

        const adminId = Number(req.adminUser?.id);

        if (!Number.isSafeInteger(adminId) || adminId < 1) {
            return res.status(401).json({
                success: false,
                message: "Administrator authentication is required."
            });
        }

        const result = await publishAnnouncement(
            id,
            adminId,
            getRequestMetadata(req)
        );

        return res.json({
            success: true,
            message: "Notification published successfully.",
            recipientsCreated: result.recipientsCreated
        });

    } catch (error) {
        if (error.code === "NOT_FOUND") {
            return res.status(404).json({
                success: false,
                message: error.message
            });
        }

        if (error.code === "CONFLICT") {
            return res.status(409).json({
                success: false,
                message: error.message
            });
        }

        return sendError(
            res,
            error,
            "Could not publish this notification."
        );
    }
});

// ==========================================
// CANCEL SCHEDULED NOTIFICATION
// ==========================================

router.post("/:id/cancel", async (req, res) => {
    try {
        if (!hasPermission(req, "notifications.manage")) {
            return res.status(403).json({
                success: false,
                message: "You do not have permission to cancel notifications."
            });
        }

        const id = validateId(req.params.id);

        if (!id) {
            return res.status(400).json({
                success: false,
                message: "Invalid notification ID."
            });
        }

        const adminId = Number(req.adminUser?.id);
        const metadata = getRequestMetadata(req);

        await withTransaction(async client => {
            const result = await run(
                `UPDATE platform_announcements
                 SET
                    status = 'cancelled',
                    updated_at = CURRENT_TIMESTAMP
                 WHERE id = $1
                   AND status = 'scheduled'`,
                [id],
                client
            );

            if (result.changes !== 1) {
                const error = new Error(
                    "Only scheduled notifications can be cancelled."
                );

                error.code = "CONFLICT";
                throw error;
            }

            await recordAudit(
                adminId,
                "notification.cancelled",
                id,
                {
                    reason: "Scheduled notification cancelled by administrator."
                },
                metadata,
                client
            );
        });

        return res.json({
            success: true,
            message: "Scheduled notification cancelled."
        });

    } catch (error) {
        if (error.code === "CONFLICT") {
            return res.status(409).json({
                success: false,
                message: error.message
            });
        }

        return sendError(
            res,
            error,
            "Could not cancel this scheduled notification."
        );
    }
});

// Exposed for the server's background scheduler.
router.processDueAnnouncements = processDueAnnouncements;

module.exports = router;
