
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

function run(sql, params = []) {
    return new Promise((resolve, reject) => {
        db.run(sql, params, function (error) {
            if (error) return reject(error);
            resolve(this);
        });
    });
}

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

function hasPermission(req, permission) {
    return (
        req.adminPermissions instanceof Set &&
        req.adminPermissions.has(permission)
    );
}

function denyPermission(res) {
    return res.status(403).json({
        success: false,
        message: "You do not have permission to perform this action."
    });
}

function sendError(res, error, message) {
    console.error(message, error);

    return res.status(500).json({
        success: false,
        message
    });
}

function sendValidationError(res, error) {
    return res.status(400).json({
        success: false,
        message: error.message
    });
}

// ==========================================
// DATE HELPERS
// ==========================================

function normalizeDateTime(value, fieldName) {
    if (value === null || value === "") {
        return null;
    }

    if (typeof value !== "string") {
        throw new Error(`${fieldName} must be a valid date and time.`);
    }

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
        throw new Error(`${fieldName} must be a valid date and time.`);
    }

    return date.toISOString()
        .slice(0, 19)
        .replace("T", " ");
}

function readStoredDate(value) {
    if (!value) {
        return null;
    }

    if (value instanceof Date) {
        return Number.isNaN(value.getTime()) ? null : value;
    }

    if (typeof value !== "string") {
        return null;
    }

    const date = new Date(
        `${value.replace(" ", "T")}${/[zZ]|[+-]\d{2}:\d{2}$/.test(value) ? "" : "Z"}`
    );

    return Number.isNaN(date.getTime()) ? null : date;
}

// ==========================================
// VALIDATION HELPERS
// ==========================================

function validateText(value, fieldName, maxLength, allowEmpty = false) {
    if (typeof value !== "string") {
        throw new Error(`${fieldName} must be text.`);
    }

    const cleaned = value.trim();

    if (!allowEmpty && !cleaned) {
        throw new Error(`${fieldName} cannot be empty.`);
    }

    if (cleaned.length > maxLength) {
        throw new Error(
            `${fieldName} cannot exceed ${maxLength} characters.`
        );
    }

    return cleaned;
}

function getOptionalText(body, fieldName, maxLength, currentValue) {
    if (!Object.prototype.hasOwnProperty.call(body, fieldName)) {
        return currentValue;
    }

    if (body[fieldName] === null) {
        return null;
    }

    return validateText(
        body[fieldName],
        fieldName,
        maxLength,
        true
    );
}

function getOptionalDate(body, fieldName, currentValue) {
    if (!Object.prototype.hasOwnProperty.call(body, fieldName)) {
        return currentValue;
    }

    return normalizeDateTime(body[fieldName], fieldName);
}

function requireBodyObject(req) {
    return (
        req.body &&
        typeof req.body === "object" &&
        !Array.isArray(req.body)
    );
}

// ==========================================
// MAINTENANCE DATABASE HELPERS
// ==========================================

async function getMaintenanceSettings() {
    return get(`
        SELECT *
        FROM platform_maintenance
        WHERE id = 1
        LIMIT 1
    `);
}

async function writeMaintenanceEvent({
    eventType,
    req = null,
    adminUserId = null,
    previousState = null,
    newState = null,
    details = null
}) {
    await run(
        `INSERT INTO maintenance_events (
            event_type,
            admin_user_id,
            previous_state_json,
            new_state_json,
            details
        )
        VALUES (?, ?, ?, ?, ?)`,
        [
            eventType,
            adminUserId,
            previousState ? JSON.stringify(previousState) : null,
            newState ? JSON.stringify(newState) : null,
            details
        ]
    );

    if (adminUserId !== null) {
        await run(
            `INSERT INTO admin_activity_logs (
                admin_user_id,
                action,
                target_type,
                target_id,
                details_json,
                ip_address,
                user_agent
            )
            VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [
                adminUserId,
                eventType,
                "platform_maintenance",
                "1",
                JSON.stringify({
                    previousState,
                    newState,
                    details
                }),
                req ? req.ip : null,
                req ? req.get("user-agent") || null : null
            ]
        );
    }
}

// ==========================================
// PERSISTENT SCHEDULER FAILURE LOGGING
// ==========================================

async function getLatestSchedulerHealthEvent() {
    return get(
        `SELECT event_type, created_at
         FROM maintenance_events
         WHERE event_type IN (
             'maintenance.scheduler_failed',
             'maintenance.scheduler_recovered'
         )
         ORDER BY id DESC
         LIMIT 1`
    );
}

async function recordSchedulerFailure(errorMessage) {
    try {
        const latest = await getLatestSchedulerHealthEvent();

        if (latest && latest.event_type === "maintenance.scheduler_failed") {
            const failureDate = readStoredDate(latest.created_at);

            if (
                failureDate &&
                Date.now() - failureDate.getTime() < 5 * 60 * 1000
            ) {
                return;
            }
        }

        await writeMaintenanceEvent({
            eventType: "maintenance.scheduler_failed",
            details: `Automatic maintenance scheduler failed: ${String(
                errorMessage
            ).slice(0, 2000)}`
        });

        console.error(
            "WIN automatic maintenance failure was recorded in maintenance history."
        );
    } catch (loggingError) {
        console.error(
            "Could not persist the maintenance scheduler failure:",
            loggingError.message
        );
    }
}

async function recordSchedulerRecovery() {
    try {
        const latest = await getLatestSchedulerHealthEvent();

        if (!latest || latest.event_type !== "maintenance.scheduler_failed") {
            return;
        }

        await writeMaintenanceEvent({
            eventType: "maintenance.scheduler_recovered",
            details: "The automatic maintenance scheduler is operating successfully again."
        });

        console.log(
            "WIN automatic maintenance scheduler recovery was recorded."
        );
    } catch (loggingError) {
        console.error(
            "Could not persist the maintenance scheduler recovery:",
            loggingError.message
        );
    }
}

// ==========================================
// POSTGRESQL TRANSACTION HELPER
// ==========================================

async function withTransaction(callback) {
    await run("BEGIN");

    try {
        const result = await callback();
        await run("COMMIT");
        return result;
    } catch (error) {
        try {
            await run("ROLLBACK");
        } catch (rollbackError) {
            console.error(
                "Maintenance transaction rollback failed:",
                rollbackError.message
            );
        }

        throw error;
    }
}

// ==========================================
// STATUS HELPERS
// ==========================================

function getPublicStatus(settings) {
    if (Number(settings.maintenance_enabled) === 1) {
        return "under_maintenance";
    }

    if (Number(settings.schedule_enabled) === 1) {
        return "scheduled";
    }

    return "operational";
}

// ==========================================
// GET CURRENT MAINTENANCE STATUS
// ==========================================

router.get("/", async (req, res) => {
    if (!hasPermission(req, "maintenance.view")) {
        return denyPermission(res);
    }

    try {
        const settings = await getMaintenanceSettings();

        if (!settings) {
            return res.status(503).json({
                success: false,
                message: "Maintenance settings are unavailable."
            });
        }

        return res.json({
            success: true,
            status: getPublicStatus(settings),
            settings
        });
    } catch (error) {
        return sendError(
            res,
            error,
            "Could not load maintenance status."
        );
    }
});

// ==========================================
// GET MAINTENANCE EVENT HISTORY
// ==========================================

router.get("/history", async (req, res) => {
    if (!hasPermission(req, "maintenance.view")) {
        return denyPermission(res);
    }

    try {
        const events = await all(
            `SELECT
                events.id,
                events.event_type,
                events.admin_user_id,
                events.previous_state_json,
                events.new_state_json,
                events.details,
                events.created_at,
                admins.full_name AS admin_name,
                admins.email AS admin_email
             FROM maintenance_events AS events
             LEFT JOIN admin_users AS admins
                ON admins.id = events.admin_user_id
             ORDER BY events.id DESC
             LIMIT 100`
        );

        return res.json({
            success: true,
            events
        });
    } catch (error) {
        return sendError(
            res,
            error,
            "Could not load maintenance history."
        );
    }
});

// ==========================================
// UPDATE MAINTENANCE MESSAGE AND SETTINGS
// ==========================================

router.patch("/settings", async (req, res) => {
    if (!hasPermission(req, "maintenance.manage")) {
        return denyPermission(res);
    }

    if (!requireBodyObject(req)) {
        return res.status(400).json({
            success: false,
            message: "A valid settings object is required."
        });
    }

    try {
        const result = await withTransaction(async () => {
            const previous = await getMaintenanceSettings();

            if (!previous) {
                throw new Error("Maintenance settings are unavailable.");
            }

            const message = getOptionalText(
                req.body,
                "message",
                1000,
                previous.message
            );

            if (!message) {
                throw new Error("Maintenance message cannot be empty.");
            }

            const reason = getOptionalText(
                req.body,
                "reason",
                500,
                previous.reason
            );

            const expectedReturnAt = getOptionalDate(
                req.body,
                "expectedReturnAt",
                previous.expected_return_at
            );

            await run(
                `UPDATE platform_maintenance
                 SET message = ?,
                     reason = ?,
                     expected_return_at = ?,
                     last_changed_by = ?,
                     updated_at = CURRENT_TIMESTAMP
                 WHERE id = 1`,
                [
                    message,
                    reason,
                    expectedReturnAt,
                    req.adminUser.id
                ]
            );

            const updated = await getMaintenanceSettings();

            await writeMaintenanceEvent({
                eventType: "maintenance.settings_updated",
                req,
                adminUserId: req.adminUser.id,
                previousState: previous,
                newState: updated,
                details: "Maintenance message or settings updated."
            });

            return updated;
        });

        return res.json({
            success: true,
            message: "Maintenance settings updated.",
            settings: result
        });
    } catch (error) {
        if (
            error.message &&
            (
                error.message.includes("must be") ||
                error.message.includes("cannot")
            )
        ) {
            return sendValidationError(res, error);
        }

        return sendError(
            res,
            error,
            "Could not update maintenance settings."
        );
    }
});

// ==========================================
// ACTIVATE MAINTENANCE IMMEDIATELY
// ==========================================

router.post("/activate", async (req, res) => {
    if (!hasPermission(req, "maintenance.manage")) {
        return denyPermission(res);
    }

    if (!requireBodyObject(req)) {
        return res.status(400).json({
            success: false,
            message: "A valid activation request is required."
        });
    }

    try {
        const result = await withTransaction(async () => {
            const previous = await getMaintenanceSettings();

            if (!previous) {
                throw new Error("Maintenance settings are unavailable.");
            }

            if (Number(previous.maintenance_enabled) === 1) {
                const error = new Error("Maintenance is already active.");
                error.statusCode = 409;
                throw error;
            }

            const message = getOptionalText(
                req.body,
                "message",
                1000,
                previous.message
            );

            if (!message) {
                throw new Error("Maintenance message cannot be empty.");
            }

            const reason = getOptionalText(
                req.body,
                "reason",
                500,
                previous.reason
            );

            const expectedReturnAt = getOptionalDate(
                req.body,
                "expectedReturnAt",
                previous.expected_return_at
            );

            await run(
                `UPDATE platform_maintenance
                 SET maintenance_enabled = 1,
                     message = ?,
                     reason = ?,
                     expected_return_at = ?,
                     schedule_enabled = 0,
                     scheduled_start_at = NULL,
                     scheduled_end_at = NULL,
                     activated_at = CURRENT_TIMESTAMP,
                     last_changed_by = ?,
                     updated_at = CURRENT_TIMESTAMP
                 WHERE id = 1`,
                [
                    message,
                    reason,
                    expectedReturnAt,
                    req.adminUser.id
                ]
            );

            const updated = await getMaintenanceSettings();

            await writeMaintenanceEvent({
                eventType: "maintenance.activated",
                req,
                adminUserId: req.adminUser.id,
                previousState: previous,
                newState: updated,
                details: "Maintenance activated manually."
            });

            return updated;
        });

        return res.json({
            success: true,
            message: "Maintenance activated.",
            status: "under_maintenance",
            settings: result
        });
    } catch (error) {
        if (error.statusCode) {
            return res.status(error.statusCode).json({
                success: false,
                message: error.message
            });
        }

        if (
            error.message &&
            (
                error.message.includes("must be") ||
                error.message.includes("cannot")
            )
        ) {
            return sendValidationError(res, error);
        }

        return sendError(
            res,
            error,
            "Could not activate maintenance."
        );
    }
});

// ==========================================
// RESTORE CUSTOMER ACCESS IMMEDIATELY
// ==========================================

router.post("/deactivate", async (req, res) => {
    if (!hasPermission(req, "maintenance.manage")) {
        return denyPermission(res);
    }

    try {
        const result = await withTransaction(async () => {
            const previous = await getMaintenanceSettings();

            if (!previous) {
                throw new Error("Maintenance settings are unavailable.");
            }

            if (Number(previous.maintenance_enabled) !== 1) {
                const error = new Error(
                    "Maintenance is not currently active."
                );
                error.statusCode = 409;
                throw error;
            }

            await run(
                `UPDATE platform_maintenance
                 SET maintenance_enabled = 0,
                     schedule_enabled = 0,
                     scheduled_start_at = NULL,
                     scheduled_end_at = NULL,
                     activated_at = NULL,
                     last_changed_by = ?,
                     updated_at = CURRENT_TIMESTAMP
                 WHERE id = 1`,
                [req.adminUser.id]
            );

            const updated = await getMaintenanceSettings();

            await writeMaintenanceEvent({
                eventType: "maintenance.deactivated",
                req,
                adminUserId: req.adminUser.id,
                previousState: previous,
                newState: updated,
                details: "Maintenance ended manually. Customer access restored."
            });

            return updated;
        });

        return res.json({
            success: true,
            message: "Maintenance ended. Customer access restored.",
            status: "operational",
            settings: result
        });
    } catch (error) {
        if (error.statusCode) {
            return res.status(error.statusCode).json({
                success: false,
                message: error.message
            });
        }

        return sendError(
            res,
            error,
            "Could not end maintenance."
        );
    }
});

// ==========================================
// SCHEDULE FUTURE MAINTENANCE
// ==========================================

router.post("/schedule", async (req, res) => {
    if (!hasPermission(req, "maintenance.manage")) {
        return denyPermission(res);
    }

    if (!requireBodyObject(req)) {
        return res.status(400).json({
            success: false,
            message: "A valid schedule request is required."
        });
    }

    try {
        const startAt = normalizeDateTime(
            req.body.startAt,
            "Start date and time"
        );

        const endAt = normalizeDateTime(
            req.body.endAt,
            "End date and time"
        );

        if (!startAt || !endAt) {
            throw new Error(
                "Both maintenance start and end times are required."
            );
        }

        const startDate = readStoredDate(startAt);
        const endDate = readStoredDate(endAt);

        if (!startDate || !endDate || endDate <= startDate) {
            throw new Error(
                "The maintenance end time must be after its start time."
            );
        }

        if (startDate <= new Date()) {
            throw new Error(
                "The maintenance start time must be in the future."
            );
        }

        const result = await withTransaction(async () => {
            const previous = await getMaintenanceSettings();

            if (!previous) {
                throw new Error("Maintenance settings are unavailable.");
            }

            if (Number(previous.maintenance_enabled) === 1) {
                const error = new Error(
                    "End the current maintenance before scheduling another window."
                );
                error.statusCode = 409;
                throw error;
            }

            const message = getOptionalText(
                req.body,
                "message",
                1000,
                previous.message
            );

            if (!message) {
                throw new Error("Maintenance message cannot be empty.");
            }

            const reason = getOptionalText(
                req.body,
                "reason",
                500,
                previous.reason
            );

            const expectedReturnAt = getOptionalDate(
                req.body,
                "expectedReturnAt",
                endAt
            );

            await run(
                `UPDATE platform_maintenance
                 SET maintenance_enabled = 0,
                     message = ?,
                     reason = ?,
                     expected_return_at = ?,
                     schedule_enabled = 1,
                     scheduled_start_at = ?,
                     scheduled_end_at = ?,
                     activated_at = NULL,
                     last_changed_by = ?,
                     updated_at = CURRENT_TIMESTAMP
                 WHERE id = 1`,
                [
                    message,
                    reason,
                    expectedReturnAt || endAt,
                    startAt,
                    endAt,
                    req.adminUser.id
                ]
            );

            const updated = await getMaintenanceSettings();

            await writeMaintenanceEvent({
                eventType: "maintenance.scheduled",
                req,
                adminUserId: req.adminUser.id,
                previousState: previous,
                newState: updated,
                details: "A future maintenance window was scheduled."
            });

            return updated;
        });

        return res.json({
            success: true,
            message: "Maintenance window scheduled.",
            status: "scheduled",
            settings: result
        });
    } catch (error) {
        if (error.statusCode) {
            return res.status(error.statusCode).json({
                success: false,
                message: error.message
            });
        }

        if (
            error.message &&
            (
                error.message.includes("must be") ||
                error.message.includes("required") ||
                error.message.includes("cannot")
            )
        ) {
            return sendValidationError(res, error);
        }

        return sendError(
            res,
            error,
            "Could not schedule maintenance."
        );
    }
});

// ==========================================
// CANCEL A FUTURE MAINTENANCE WINDOW
// ==========================================

router.post("/schedule/cancel", async (req, res) => {
    if (!hasPermission(req, "maintenance.manage")) {
        return denyPermission(res);
    }

    try {
        const result = await withTransaction(async () => {
            const previous = await getMaintenanceSettings();

            if (!previous) {
                throw new Error("Maintenance settings are unavailable.");
            }

            if (Number(previous.schedule_enabled) !== 1) {
                const error = new Error(
                    "There is no scheduled maintenance window to cancel."
                );
                error.statusCode = 409;
                throw error;
            }

            if (Number(previous.maintenance_enabled) === 1) {
                const error = new Error(
                    "Maintenance has already started. Use End Maintenance to restore customer access."
                );
                error.statusCode = 409;
                throw error;
            }

            const scheduledStart = readStoredDate(
                previous.scheduled_start_at
            );

            if (!scheduledStart) {
                throw new Error(
                    "The scheduled start time is invalid. Review the maintenance settings."
                );
            }

            if (scheduledStart <= new Date()) {
                const error = new Error(
                    "The scheduled start time has arrived. Wait for the automatic processor, then use End Maintenance if necessary."
                );
                error.statusCode = 409;
                throw error;
            }

            await run(
                `UPDATE platform_maintenance
                 SET schedule_enabled = 0,
                     scheduled_start_at = NULL,
                     scheduled_end_at = NULL,
                     last_changed_by = ?,
                     updated_at = CURRENT_TIMESTAMP
                 WHERE id = 1
                   AND schedule_enabled = 1
                   AND maintenance_enabled = 0`,
                [req.adminUser.id]
            );

            const updated = await getMaintenanceSettings();

            await writeMaintenanceEvent({
                eventType: "maintenance.schedule_cancelled",
                req,
                adminUserId: req.adminUser.id,
                previousState: previous,
                newState: updated,
                details: "Future maintenance window cancelled."
            });

            return updated;
        });

        return res.json({
            success: true,
            message: "Scheduled maintenance cancelled.",
            status: "operational",
            settings: result
        });
    } catch (error) {
        if (error.statusCode) {
            return res.status(error.statusCode).json({
                success: false,
                message: error.message
            });
        }

        if (error.message && error.message.includes("invalid")) {
            return sendValidationError(res, error);
        }

        return sendError(
            res,
            error,
            "Could not cancel maintenance schedule."
        );
    }
});

// ==========================================
// AUTOMATIC MAINTENANCE SCHEDULER
// ==========================================

async function processDueMaintenance() {
    return db.withConnection(async () => {
        try {
        const result = await withTransaction(async () => {
            const settings = await getMaintenanceSettings();

            if (!settings) {
                return {
                    success: false,
                    message: "Maintenance settings are unavailable."
                };
            }

            if (Number(settings.schedule_enabled) !== 1) {
                return {
                    success: true,
                    processed: false
                };
            }

            const now = new Date();

            const startDate = readStoredDate(
                settings.scheduled_start_at
            );

            const endDate = readStoredDate(
                settings.scheduled_end_at
            );

            let changed = false;

            if (
                Number(settings.maintenance_enabled) !== 1 &&
                startDate &&
                startDate <= now
            ) {
                const previous = settings;

                await run(
                    `UPDATE platform_maintenance
                     SET maintenance_enabled = 1,
                         activated_at = CURRENT_TIMESTAMP,
                         updated_at = CURRENT_TIMESTAMP
                     WHERE id = 1
                       AND schedule_enabled = 1
                       AND maintenance_enabled = 0`
                );

                const updated = await getMaintenanceSettings();

                await writeMaintenanceEvent({
                    eventType: "maintenance.activated_automatically",
                    previousState: previous,
                    newState: updated,
                    details: "Scheduled maintenance started automatically."
                });

                changed = true;
            }

            const latest = await getMaintenanceSettings();

            if (
                latest &&
                Number(latest.maintenance_enabled) === 1 &&
                endDate &&
                endDate <= now
            ) {
                const previous = latest;

                await run(
                    `UPDATE platform_maintenance
                     SET maintenance_enabled = 0,
                         schedule_enabled = 0,
                         scheduled_start_at = NULL,
                         scheduled_end_at = NULL,
                         activated_at = NULL,
                         updated_at = CURRENT_TIMESTAMP
                     WHERE id = 1
                       AND schedule_enabled = 1
                       AND maintenance_enabled = 1`
                );

                const updated = await getMaintenanceSettings();

                await writeMaintenanceEvent({
                    eventType: "maintenance.deactivated_automatically",
                    previousState: previous,
                    newState: updated,
                    details: "Scheduled maintenance ended automatically. Customer access restored."
                });

                changed = true;
            }

            return {
                success: true,
                processed: changed
            };
        });

        if (result.success) {
            await recordSchedulerRecovery();
        } else {
            await recordSchedulerFailure(result.message);
        }

        return result;
    } catch (error) {
        console.error(
            "WIN automatic maintenance processor failed:",
            error.message
        );

        await recordSchedulerFailure(error.message);

        return {
            success: false,
            message: error.message
        };
        }
    });
}module.exports = router;
module.exports.processDueMaintenance = processDueMaintenance;
