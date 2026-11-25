
"use strict";

const express = require("express");
const pool = require("../config/postgresDatabase");

const router = express.Router();

// Public customer-facing maintenance status.
// Never return administrator or internal audit information.
router.get("/status", async (req, res) => {
    res.set(
        "Cache-Control",
        "no-store, no-cache, must-revalidate, private"
    );

    res.set("Pragma", "no-cache");

    try {
        const result = await pool.query(`
            SELECT
                maintenance_enabled,
                message,
                reason,
                expected_return_at
            FROM platform_maintenance
            WHERE id = 1
            LIMIT 1
        `);

        const settings = result.rows[0];

        if (!settings) {
            return res.status(503).json({
                success: false,
                maintenance: false,
                status: "unavailable",
                message: "Maintenance status is temporarily unavailable."
            });
        }

        const maintenanceEnabled =
            settings.maintenance_enabled === true ||
            Number(settings.maintenance_enabled) === 1;

        return res.json({
            success: true,
            maintenance: maintenanceEnabled,
            status: maintenanceEnabled
                ? "under_maintenance"
                : "operational",
            message: maintenanceEnabled
                ? settings.message
                : null,
            reason: maintenanceEnabled
                ? settings.reason
                : null,
            expectedReturnAt: maintenanceEnabled
                ? settings.expected_return_at
                : null
        });

    } catch (error) {
        console.error(
            "Public maintenance status error:",
            error.message
        );

        return res.status(503).json({
            success: false,
            maintenance: false,
            status: "unavailable",
            message: "WIN Business Suite maintenance status is temporarily unavailable."
        });
    }
});

module.exports = router;
