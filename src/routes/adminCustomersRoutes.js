
"use strict";

const express = require("express");
const db = require("../config/postgresRouteDatabase");
const requireAdminAuth = require("../middleware/requireAdminAuth");

const router = express.Router();

router.use(db.middleware);
router.use(requireAdminAuth);

// ==========================================
// DATABASE HELPERS
// ==========================================

function get(sql, params = []) {
    return new Promise((resolve, reject) => {
        db.get(sql, params, (error, row) => {
            if (error) return reject(error);
            resolve(row || null);
        });
    });
}

function all(sql, params = []) {
    return new Promise((resolve, reject) => {
        db.all(sql, params, (error, rows) => {
            if (error) return reject(error);
            resolve(rows || []);
        });
    });
}

function run(sql, params = []) {
    return new Promise((resolve, reject) => {
        db.run(sql, params, function (error) {
            if (error) return reject(error);
            resolve(this);
        });
    });
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
    return value.replace(/[!%_]/g, "!$&");
}

function buildSearch(search) {
    if (!search) {
        return {
            sql: "",
            params: []
        };
    }

    const pattern = `%${escapeLike(search)}%`;

    return {
        sql: `
            WHERE (
                businesses.business_name ILIKE ? ESCAPE '!'
                OR businesses.business_type ILIKE ? ESCAPE '!'
                OR businesses.email ILIKE ? ESCAPE '!'
                OR businesses.phone ILIKE ? ESCAPE '!'
                OR businesses.country ILIKE ? ESCAPE '!'
                OR owner.full_name ILIKE ? ESCAPE '!'
                OR owner.email ILIKE ? ESCAPE '!'
            )
        `,
        params: Array(7).fill(pattern)
    };
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

// ==========================================
// BUSINESS STATUS CHANGE
// ==========================================

async function changeBusinessStatus(req, res, settings) {
    const {
        requiredPermission,
        fromStatus,
        toStatus,
        action
    } = settings;

    if (!hasPermission(req, requiredPermission)) {
        return res.status(403).json({
            success: false,
            message: "You do not have permission to perform this action."
        });
    }

    const businessId = validateBusinessId(req.params.businessId);

    if (!businessId) {
        return res.status(400).json({
            success: false,
            message: "Invalid business account ID."
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

    const ipAddress = req.ip || null;
    const userAgent = req.get("user-agent")
        ? req.get("user-agent").slice(0, 500)
        : null;

    try {
        await run("BEGIN");

        try {
            // Lock the business row so concurrent status changes
            // cannot overwrite each other.
            const business = await get(
                `SELECT id, business_name, account_status
                 FROM businesses
                 WHERE id = ?
                 FOR UPDATE`,
                [businessId]
            );

            if (!business) {
                await run("COMMIT");

                return res.status(404).json({
                    success: false,
                    message: "Business account not found."
                });
            }

            if (business.account_status !== fromStatus) {
                await run("COMMIT");

                return res.status(409).json({
                    success: false,
                    code: "BUSINESS_STATUS_CONFLICT",
                    message: business.account_status === toStatus
                        ? `This business is already ${toStatus}.`
                        : "The business account status has changed. Refresh and try again.",
                    accountStatus: business.account_status
                });
            }

            const details = JSON.stringify({
                businessName: business.business_name,
                businessId,
                previousStatus: fromStatus,
                newStatus: toStatus,
                reason
            });

            let updateResult;

            if (toStatus === "suspended") {
                updateResult = await run(
                    `UPDATE businesses
                     SET
                        account_status = 'suspended',
                        suspension_reason = ?,
                        suspended_at = CURRENT_TIMESTAMP,
                        suspended_by_admin_id = ?
                     WHERE id = ?
                       AND account_status = 'active'`,
                    [reason, adminId, businessId]
                );
            } else {
                updateResult = await run(
                    `UPDATE businesses
                     SET
                        account_status = 'active',
                        suspension_reason = NULL,
                        suspended_at = NULL,
                        suspended_by_admin_id = NULL
                     WHERE id = ?
                       AND account_status = 'suspended'`,
                    [businessId]
                );
            }

            if (updateResult.changes !== 1) {
                throw new Error("BUSINESS_STATUS_CONFLICT");
            }

            await run(
                `INSERT INTO admin_activity_logs (
                    admin_user_id,
                    action,
                    target_type,
                    target_id,
                    details_json,
                    ip_address,
                    user_agent
                ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
                [
                    adminId,
                    action,
                    "business",
                    String(businessId),
                    details,
                    ipAddress,
                    userAgent
                ]
            );

            await run("COMMIT");

        } catch (transactionError) {
            try {
                await run("ROLLBACK");
            } catch (rollbackError) {
                console.error(
                    "Admin account transaction rollback failed:",
                    rollbackError.message
                );
            }

            throw transactionError;
        }

        const updatedBusiness = await get(
            `SELECT
                id,
                business_name,
                account_status,
                suspension_reason,
                suspended_at
             FROM businesses
             WHERE id = ?`,
            [businessId]
        );

        if (!updatedBusiness) {
            return res.status(404).json({
                success: false,
                message: "Business account was not found after the operation."
            });
        }

        return res.json({
            success: true,
            message: toStatus === "suspended"
                ? "Business account suspended successfully."
                : "Business account restored successfully.",
            business: updatedBusiness
        });

    } catch (error) {
        if (error.message === "BUSINESS_STATUS_CONFLICT") {
            return res.status(409).json({
                success: false,
                code: "BUSINESS_STATUS_CONFLICT",
                message: "The business account status changed before the operation could be completed."
            });
        }

        console.error(
            "Admin business status operation failed:",
            error.message
        );

        return res.status(500).json({
            success: false,
            message: "The business account status could not be changed."
        });
    }
}

// ==========================================
// GET REGISTERED BUSINESSES
// ==========================================

router.get("/", async (req, res) => {
    try {
        if (!hasPermission(req, "customers.view")) {
            return res.status(403).json({
                success: false,
                message: "You do not have permission to view customers."
            });
        }

        const page = parsePositiveInteger(
            req.query.page,
            1,
            1000000
        );

        const requestedLimit = parsePositiveInteger(
            req.query.limit,
            10,
            50
        );

        if (page === null || requestedLimit === null) {
            return res.status(400).json({
                success: false,
                message: "Invalid pagination parameters."
            });
        }

        const allowedLimits = [10, 25, 50];

        if (!allowedLimits.includes(requestedLimit)) {
            return res.status(400).json({
                success: false,
                message: "Page size must be 10, 25 or 50."
            });
        }

        const limit = requestedLimit;
        const offset = (page - 1) * limit;

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

        const searchQuery = buildSearch(search);

        const ownerJoin = `
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
        `;

        const subscriptionJoin = `
            LEFT JOIN subscriptions AS subscription
                ON subscription.business_id = businesses.id
        `;

        const joins = `
            ${ownerJoin}
            ${subscriptionJoin}
        `;

        const countResult = await get(
            `
                SELECT COUNT(*) AS total
                FROM businesses
                ${joins}
                ${searchQuery.sql}
            `,
            searchQuery.params
        );

        const total = Number(countResult?.total || 0);

        const businesses = await all(
            `
                SELECT
                    businesses.id,
                    businesses.business_name,
                    businesses.business_type,
                    businesses.email,
                    businesses.phone,
                    businesses.country,
                    businesses.currency,
                    businesses.created_at,

                    businesses.account_status,
                    businesses.suspension_reason,
                    businesses.suspended_at,

                    owner.full_name AS owner_name,
                    owner.email AS owner_email,

                    subscription.plan_name AS subscription_plan,
                    subscription.status AS subscription_status,
                    subscription.trial_started_at,
                    subscription.trial_ends_at,
                    subscription.current_period_start,
                    subscription.current_period_end

                FROM businesses

                ${joins}

                ${searchQuery.sql}

                ORDER BY
                    businesses.created_at DESC,
                    businesses.id DESC

                LIMIT ?
                OFFSET ?
            `,
            [
                ...searchQuery.params,
                limit,
                offset
            ]
        );

        const totalPages = Math.ceil(total / limit);

        return res.json({
            success: true,
            businesses,
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
                canSuspend: hasPermission(req, "customers.suspend"),
                canRestore: hasPermission(req, "customers.restore")
            },
            updatedAt: new Date().toISOString()
        });

    } catch (error) {
        console.error(
            "Admin Customers API error:",
            error.message
        );

        return res.status(500).json({
            success: false,
            message: "Could not retrieve registered businesses."
        });
    }
});

// ==========================================
// SUSPEND BUSINESS
// ==========================================

router.post("/:businessId/suspend", async (req, res) => {
    return changeBusinessStatus(req, res, {
        requiredPermission: "customers.suspend",
        fromStatus: "active",
        toStatus: "suspended",
        action: "business.suspended"
    });
});

// ==========================================
// RESTORE BUSINESS
// ==========================================

router.post("/:businessId/restore", async (req, res) => {
    return changeBusinessStatus(req, res, {
        requiredPermission: "customers.restore",
        fromStatus: "suspended",
        toStatus: "active",
        action: "business.restored"
    });
});

module.exports = router;
