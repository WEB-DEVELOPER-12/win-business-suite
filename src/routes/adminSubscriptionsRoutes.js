
"use strict";

const express = require("express");
const pool = require("../config/postgresDatabase");
const requireAdminAuth = require("../middleware/requireAdminAuth");

const router = express.Router();

router.use(requireAdminAuth);

// ==========================================
// DATABASE HELPERS
// ==========================================

async function get(sql, params = [], client = pool) {
    const result = await client.query(sql, params);
    return result.rows[0] || null;
}

async function all(sql, params = [], client = pool) {
    const result = await client.query(sql, params);
    return result.rows;
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
                "Subscription transaction rollback failed:",
                rollbackError.message
            );
        }

        throw error;
    } finally {
        client.release();
    }
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

function escapeLike(value) {
    return value.replace(/[\\%_]/g, "\\$&");
}

function hasPermission(req, permission) {
    return req.adminPermissions instanceof Set &&
        req.adminPermissions.has(permission);
}

function validateBusinessId(value) {
    if (
        typeof value !== "string" ||
        !/^[1-9]\d*$/.test(value)
    ) {
        return null;
    }

    const id = Number(value);

    return Number.isSafeInteger(id) ? id : null;
}

function validateReason(req, res) {
    const reason = req.body?.reason;

    if (typeof reason !== "string") {
        res.status(400).json({
            success: false,
            message: "An action reason is required."
        });

        return null;
    }

    const cleanReason = reason.trim();

    if (cleanReason.length < 5 || cleanReason.length > 500) {
        res.status(400).json({
            success: false,
            message: "The reason must contain between 5 and 500 characters."
        });

        return null;
    }

    return cleanReason;
}

function validateBillingCycle(value) {
    return value === "monthly" || value === "annual"
        ? value
        : null;
}

function validateActivationType(value) {
    if (value === undefined) return "manual";

    return value === "manual" || value === "complimentary"
        ? value
        : null;
}

function getPlanPrice(cycle) {
    return cycle === "monthly" ? 1000 : 10000;
}

// ==========================================
// DATE HELPERS
// ==========================================

function getUtcDate() {
    return new Date().toISOString().slice(0, 10);
}

function getUtcDateTime() {
    return new Date().toISOString()
        .replace("T", " ")
        .slice(0, 19);
}

function validateStartDate(value) {
    if (value === undefined) {
        return getUtcDate();
    }

    if (
        typeof value !== "string" ||
        !/^\d{4}-\d{2}-\d{2}$/.test(value)
    ) {
        return null;
    }

    const date = new Date(`${value}T00:00:00.000Z`);

    if (
        Number.isNaN(date.getTime()) ||
        date.toISOString().slice(0, 10) !== value
    ) {
        return null;
    }

    return value;
}

function toValidDate(value) {
    if (!value) return null;

    const date = value instanceof Date
        ? new Date(value.getTime())
        : new Date(
            typeof value === "string" &&
            !/[zZ]|[+-]\d{2}:\d{2}$/.test(value)
                ? `${value.replace(" ", "T")}Z`
                : value
        );

    return Number.isNaN(date.getTime()) ? null : date;
}

function normalizeDateTime(value) {
    const date = toValidDate(value);

    if (!date) return null;

    return date.toISOString()
        .replace("T", " ")
        .slice(0, 19);
}

function isFutureDate(value) {
    const date = toValidDate(value);

    return Boolean(date && date.getTime() > Date.now());
}

// Adds calendar months while preserving the time of day.
// The day is clamped to the last valid day of the destination month.
function addMonthsToDateTime(value, months) {
    const date = toValidDate(value);

    if (!date) {
        throw new Error("Invalid subscription start date.");
    }

    const originalDay = date.getUTCDate();

    date.setUTCDate(1);
    date.setUTCMonth(date.getUTCMonth() + months);

    const lastDay = new Date(Date.UTC(
        date.getUTCFullYear(),
        date.getUTCMonth() + 1,
        0
    )).getUTCDate();

    date.setUTCDate(Math.min(originalDay, lastDay));

    return date.toISOString()
        .replace("T", " ")
        .slice(0, 19);
}

function dateToDateTime(date) {
    return `${date} 00:00:00`;
}

function getCurrentStatus(subscription) {
    if (!subscription) return "not_started";

    if (
        subscription.status === "trial" &&
        subscription.trial_ends_at &&
        !isFutureDate(subscription.trial_ends_at)
    ) {
        return "expired";
    }

    if (
        subscription.status === "active" &&
        subscription.current_period_end &&
        !isFutureDate(subscription.current_period_end)
    ) {
        return "expired";
    }

    return subscription.status;
}

// ==========================================
// AUDIT LOG HELPER
// ==========================================

async function recordAudit(req, client, settings) {
    const adminId = Number(req.adminUser?.id);

    if (!Number.isSafeInteger(adminId) || adminId < 1) {
        throw new Error("Invalid administrator identity.");
    }

    const ipAddress = req.ip || null;

    const userAgent = req.get("user-agent")
        ? req.get("user-agent").slice(0, 500)
        : null;

    await client.query(
        `INSERT INTO admin_activity_logs (
            admin_user_id,
            action,
            target_type,
            target_id,
            details_json,
            ip_address,
            user_agent
        ) VALUES ($1, $2, 'subscription', $3, $4, $5, $6)`,
        [
            adminId,
            settings.action,
            String(settings.businessId),
            JSON.stringify(settings.details),
            ipAddress,
            userAgent
        ]
    );
}

// ==========================================
// SUBSCRIPTION PRICE AND PLAN INFORMATION
// ==========================================

function buildPlanInformation(cycle, activationType) {
    const standardPrice = getPlanPrice(cycle);

    return {
        planName: "WIN Pro",
        billingCycle: cycle,
        standardPrice,
        currency: "KES",
        activationType,
        complimentary: activationType === "complimentary"
    };
}

// ==========================================
// GET SUBSCRIPTION LIST
// ==========================================

router.get("/", async (req, res) => {
    try {
        if (!hasPermission(req, "subscriptions.view")) {
            return res.status(403).json({
                success: false,
                message: "You do not have permission to view subscriptions."
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

        const rawSearch = req.query.search ?? "";

        if (typeof rawSearch !== "string") {
            return res.status(400).json({
                success: false,
                message: "Invalid search value."
            });
        }

        const search = rawSearch.trim();

        if (search.length > 100) {
            return res.status(400).json({
                success: false,
                message: "Search must not exceed 100 characters."
            });
        }

        const joins = `
            LEFT JOIN users AS owner
                ON owner.id = (
                    SELECT account_owner.id
                    FROM users AS account_owner
                    WHERE account_owner.business_id = businesses.id
                    ORDER BY
                        CASE
                            WHEN account_owner.role = 'owner' THEN 0
                            ELSE 1
                        END,
                        account_owner.id ASC
                    LIMIT 1
                )

            LEFT JOIN subscriptions AS subscription
                ON subscription.business_id = businesses.id
        `;

        const searchSql = search
            ? `
                WHERE (
                    businesses.business_name ILIKE $1 ESCAPE E'\\\\'
                    OR businesses.business_type ILIKE $2 ESCAPE E'\\\\'
                    OR owner.full_name ILIKE $3 ESCAPE E'\\\\'
                    OR owner.email ILIKE $4 ESCAPE E'\\\\'
                    OR businesses.email ILIKE $5 ESCAPE E'\\\\'
                )
            `
            : "";

        const searchPattern = `%${escapeLike(search)}%`;

        const searchParams = search
            ? Array(5).fill(searchPattern)
            : [];

        const count = await get(
            `
                SELECT COUNT(*) AS total
                FROM businesses
                ${joins}
                ${searchSql}
            `,
            searchParams
        );

        const total = Number(count?.total || 0);
        const offset = (page - 1) * limit;

        const subscriptions = await all(
            `
                SELECT
                    businesses.id AS business_id,
                    businesses.business_name,
                    businesses.business_type,

                    owner.full_name AS owner_name,
                    owner.email AS owner_email,

                    subscription.id AS subscription_id,
                    subscription.plan_name,
                    subscription.status,
                    subscription.billing_cycle,
                    subscription.activation_type,
                    subscription.trial_started_at,
                    subscription.trial_ends_at,
                    subscription.current_period_start,
                    subscription.current_period_end,
                    subscription.updated_at

                FROM businesses

                ${joins}

                ${searchSql}

                ORDER BY businesses.created_at DESC,
                         businesses.id DESC

                LIMIT $${searchParams.length + 1}
                OFFSET $${searchParams.length + 2}
            `,
            [
                ...searchParams,
                limit,
                offset
            ]
        );

        const formatted = subscriptions.map(item => ({
            ...item,
            current_status: getCurrentStatus(
                item.subscription_id ? item : null
            )
        }));

        const totalPages = Math.ceil(total / limit);

        return res.json({
            success: true,

            subscriptions: formatted,

            pagination: {
                page,
                limit,
                total,
                totalPages,
                hasNext: page < totalPages,
                hasPrevious: page > 1
            },

            search,

            permissions: {
                canView: true,
                canActivate: hasPermission(
                    req,
                    "subscriptions.activate"
                ),
                canRenew: hasPermission(
                    req,
                    "subscriptions.renew"
                )
            },

            updatedAt: new Date().toISOString()
        });

    } catch (error) {
        console.error(
            "Admin Subscriptions API error:",
            error.message
        );

        return res.status(500).json({
            success: false,
            message: "Could not retrieve subscriptions."
        });
    }
});

// ==========================================
// GET SUBSCRIPTION HISTORY
// ==========================================

router.get("/:businessId/history", async (req, res) => {
    try {
        if (!hasPermission(req, "subscriptions.view")) {
            return res.status(403).json({
                success: false,
                message: "You do not have permission to view subscription history."
            });
        }

        const businessId = validateBusinessId(
            req.params.businessId
        );

        if (!businessId) {
            return res.status(400).json({
                success: false,
                message: "Invalid business account ID."
            });
        }

        const business = await get(
            `SELECT id, business_name
             FROM businesses
             WHERE id = $1`,
            [businessId]
        );

        if (!business) {
            return res.status(404).json({
                success: false,
                message: "Business account not found."
            });
        }

        const history = await all(
            `
                SELECT
                    logs.id,
                    logs.action,
                    logs.details_json,
                    logs.created_at,
                    admin.full_name AS administrator_name

                FROM admin_activity_logs AS logs

                LEFT JOIN admin_users AS admin
                    ON admin.id = logs.admin_user_id

                WHERE logs.target_type = 'subscription'
                  AND logs.target_id = $1

                ORDER BY logs.created_at DESC, logs.id DESC

                LIMIT 50
            `,
            [String(businessId)]
        );

        const formattedHistory = history.map(item => {
            let details = {};

            try {
                details = typeof item.details_json === "string"
                    ? JSON.parse(item.details_json || "{}")
                    : item.details_json || {};
            } catch {
                details = {
                    message: "History details could not be decoded."
                };
            }

            return {
                id: item.id,
                action: item.action,
                details,
                administratorName:
                    item.administrator_name || "Former administrator",
                createdAt: item.created_at
            };
        });

        return res.json({
            success: true,
            business,
            history: formattedHistory
        });

    } catch (error) {
        console.error(
            "Subscription history error:",
            error.message
        );

        return res.status(500).json({
            success: false,
            message: "Could not retrieve subscription history."
        });
    }
});

// ==========================================
// MANUALLY ACTIVATE SUBSCRIPTION
// ==========================================

router.post("/:businessId/activate", async (req, res) => {
    try {
        if (!hasPermission(req, "subscriptions.activate")) {
            return res.status(403).json({
                success: false,
                message: "You do not have permission to activate subscriptions."
            });
        }

        const businessId = validateBusinessId(
            req.params.businessId
        );

        if (!businessId) {
            return res.status(400).json({
                success: false,
                message: "Invalid business account ID."
            });
        }

        const cycle = validateBillingCycle(
            req.body?.billingCycle
        );

        if (!cycle) {
            return res.status(400).json({
                success: false,
                message: "Choose monthly or annual billing."
            });
        }

        const activationType = validateActivationType(
            req.body?.activationType
        );

        if (!activationType) {
            return res.status(400).json({
                success: false,
                message: "Invalid activation type."
            });
        }

        const reason = validateReason(req, res);
        if (!reason) return;

        const startDate = validateStartDate(
            req.body?.startDate
        );

        if (!startDate) {
            return res.status(400).json({
                success: false,
                message: "Enter a valid activation date in YYYY-MM-DD format."
            });
        }

        const adminId = Number(req.adminUser?.id);

        if (!Number.isSafeInteger(adminId) || adminId < 1) {
            return res.status(401).json({
                success: false,
                message: "Administrator authentication is required."
            });
        }

        const result = await withTransaction(async client => {
            const business = await get(
                `SELECT id, business_name
                 FROM businesses
                 WHERE id = $1
                 FOR UPDATE`,
                [businessId],
                client
            );

            if (!business) {
                const error = new Error("Business account not found.");
                error.code = "BUSINESS_NOT_FOUND";
                throw error;
            }

            const existing = await get(
                `SELECT *
                 FROM subscriptions
                 WHERE business_id = $1
                 FOR UPDATE`,
                [businessId],
                client
            );

            if (
                existing &&
                existing.status === "active" &&
                isFutureDate(existing.current_period_end)
            ) {
                const error = new Error(
                    "This subscription is already active. Use renewal to extend it."
                );
                error.code = "SUBSCRIPTION_ALREADY_ACTIVE";
                throw error;
            }

            const startDateTime = dateToDateTime(startDate);
            const months = cycle === "monthly" ? 1 : 12;

            const endDateTime = addMonthsToDateTime(
                startDateTime,
                months
            );

            const plan = buildPlanInformation(
                cycle,
                activationType
            );

            const details = {
                businessId,
                businessName: business.business_name,
                action: "manual_activation",
                planName: "WIN Pro",
                billingCycle: cycle,
                standardPrice: plan.standardPrice,
                currency: "KES",
                activationType,
                startDate: startDateTime,
                endDate: endDateTime,
                previousStatus: existing?.status || "not_started",
                reason
            };

            const updated = await get(
                `
                    INSERT INTO subscriptions (
                        business_id,
                        plan_name,
                        status,
                        trial_started_at,
                        trial_ends_at,
                        current_period_start,
                        current_period_end,
                        billing_cycle,
                        activation_type,
                        created_at,
                        updated_at
                    )
                    VALUES (
                        $1,
                        'WIN Pro',
                        'active',
                        NULL,
                        NULL,
                        $2,
                        $3,
                        $4,
                        $5,
                        CURRENT_TIMESTAMP,
                        CURRENT_TIMESTAMP
                    )
                    ON CONFLICT (business_id)
                    DO UPDATE SET
                        plan_name = 'WIN Pro',
                        status = 'active',
                        trial_ends_at = NULL,
                        current_period_start = EXCLUDED.current_period_start,
                        current_period_end = EXCLUDED.current_period_end,
                        billing_cycle = EXCLUDED.billing_cycle,
                        activation_type = EXCLUDED.activation_type,
                        updated_at = CURRENT_TIMESTAMP
                    RETURNING *
                `,
                [
                    businessId,
                    startDateTime,
                    endDateTime,
                    cycle,
                    activationType
                ],
                client
            );

            await recordAudit(req, client, {
                action: "subscription.manually_activated",
                businessId,
                details
            });

            return updated;
        });

        return res.json({
            success: true,
            message: activationType === "complimentary"
                ? "Complimentary subscription activated successfully."
                : "Subscription activated successfully.",
            subscription: result
        });

    } catch (error) {
        if (error.code === "BUSINESS_NOT_FOUND") {
            return res.status(404).json({
                success: false,
                message: error.message
            });
        }

        if (error.code === "SUBSCRIPTION_ALREADY_ACTIVE") {
            return res.status(409).json({
                success: false,
                code: error.code,
                message: error.message
            });
        }

        console.error(
            "Manual subscription activation failed:",
            error.message
        );

        return res.status(500).json({
            success: false,
            message: "Could not activate the subscription."
        });
    }
});

// ==========================================
// RENEW OR EXTEND SUBSCRIPTION
// ==========================================

router.post("/:businessId/renew", async (req, res) => {
    try {
        if (!hasPermission(req, "subscriptions.renew")) {
            return res.status(403).json({
                success: false,
                message: "You do not have permission to renew subscriptions."
            });
        }

        const businessId = validateBusinessId(
            req.params.businessId
        );

        if (!businessId) {
            return res.status(400).json({
                success: false,
                message: "Invalid business account ID."
            });
        }

        const cycle = validateBillingCycle(
            req.body?.billingCycle
        );

        if (!cycle) {
            return res.status(400).json({
                success: false,
                message: "Choose monthly or annual billing."
            });
        }

        const activationType = validateActivationType(
            req.body?.activationType
        );

        if (!activationType) {
            return res.status(400).json({
                success: false,
                message: "Invalid activation type."
            });
        }

        const reason = validateReason(req, res);
        if (!reason) return;

        const adminId = Number(req.adminUser?.id);

        if (!Number.isSafeInteger(adminId) || adminId < 1) {
            return res.status(401).json({
                success: false,
                message: "Administrator authentication is required."
            });
        }

        const result = await withTransaction(async client => {
            const business = await get(
                `SELECT id, business_name
                 FROM businesses
                 WHERE id = $1
                 FOR UPDATE`,
                [businessId],
                client
            );

            if (!business) {
                const error = new Error("Business account not found.");
                error.code = "BUSINESS_NOT_FOUND";
                throw error;
            }

            const existing = await get(
                `SELECT *
                 FROM subscriptions
                 WHERE business_id = $1
                 FOR UPDATE`,
                [businessId],
                client
            );

            if (!existing) {
                const error = new Error(
                    "Activate a subscription before renewing it."
                );
                error.code = "SUBSCRIPTION_NOT_FOUND";
                throw error;
            }

            // Continue from the remaining paid period.
            // If a trial is still running, begin after the trial.
            // Otherwise, begin from the current UTC date and time.
            let startDateTime;

            if (isFutureDate(existing.current_period_end)) {
                startDateTime = normalizeDateTime(
                    existing.current_period_end
                );
            } else if (isFutureDate(existing.trial_ends_at)) {
                startDateTime = normalizeDateTime(
                    existing.trial_ends_at
                );
            } else {
                startDateTime = getUtcDateTime();
            }

            const months = cycle === "monthly" ? 1 : 12;

            const endDateTime = addMonthsToDateTime(
                startDateTime,
                months
            );

            const plan = buildPlanInformation(
                cycle,
                activationType
            );

            const details = {
                businessId,
                businessName: business.business_name,
                action: "subscription_renewal",
                planName: "WIN Pro",
                billingCycle: cycle,
                standardPrice: plan.standardPrice,
                currency: "KES",
                activationType,
                previousStatus: existing.status,
                previousPeriodEnd: existing.current_period_end,
                startDate: startDateTime,
                endDate: endDateTime,
                reason
            };

            const updated = await get(
                `
                    UPDATE subscriptions
                    SET
                        plan_name = 'WIN Pro',
                        status = 'active',
                        trial_ends_at = NULL,
                        current_period_start = $1,
                        current_period_end = $2,
                        billing_cycle = $3,
                        activation_type = $4,
                        updated_at = CURRENT_TIMESTAMP
                    WHERE business_id = $5
                    RETURNING *
                `,
                [
                    startDateTime,
                    endDateTime,
                    cycle,
                    activationType,
                    businessId
                ],
                client
            );

            if (!updated) {
                throw new Error(
                    "Subscription could not be updated."
                );
            }

            await recordAudit(req, client, {
                action: "subscription.renewed",
                businessId,
                details
            });

            return updated;
        });

        return res.json({
            success: true,
            message: activationType === "complimentary"
                ? "Complimentary subscription extension completed."
                : "Subscription renewed successfully.",
            subscription: result
        });

    } catch (error) {
        if (error.code === "BUSINESS_NOT_FOUND") {
            return res.status(404).json({
                success: false,
                message: error.message
            });
        }

        if (error.code === "SUBSCRIPTION_NOT_FOUND") {
            return res.status(409).json({
                success: false,
                code: error.code,
                message: error.message
            });
        }

        console.error(
            "Subscription renewal failed:",
            error.message
        );

        return res.status(500).json({
            success: false,
            message: "Could not renew the subscription."
        });
    }
});

module.exports = router;
