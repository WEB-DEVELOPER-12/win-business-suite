
"use strict";

const express = require("express");
const pool = require("../config/postgresDatabase");
const requireAdminAuth = require("../middleware/requireAdminAuth");

const router = express.Router();

router.use(requireAdminAuth);

// Check permission to view platform statistics.
function requireDashboardPermission(req, res, next) {
    if (
        !req.adminPermissions ||
        !req.adminPermissions.has("dashboard.view")
    ) {
        return res.status(403).json({
            success: false,
            message: "You do not have permission to view the Admin Overview."
        });
    }

    next();
}

// GET ADMIN OVERVIEW STATISTICS
router.get("/", requireDashboardPermission, async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT
                (
                    SELECT COUNT(*)
                    FROM businesses
                ) AS total_customers,

                (
                    SELECT COUNT(*)
                    FROM subscriptions
                    WHERE status = 'active'
                ) AS active_subscriptions,

                (
                    SELECT COUNT(*)
                    FROM subscriptions
                    WHERE status = 'trial'
                ) AS trial_customers,

                (
                    SELECT COUNT(*)
                    FROM subscription_payments
                    WHERE status = 'pending'
                ) AS pending_payments
        `);

        const stats = result.rows[0];

        if (!stats) {
            throw new Error("Platform statistics could not be retrieved.");
        }

        return res.json({
            success: true,
            stats: {
                totalCustomers: Number(stats.total_customers) || 0,
                activeSubscriptions: Number(stats.active_subscriptions) || 0,
                trialCustomers: Number(stats.trial_customers) || 0,
                pendingPayments: Number(stats.pending_payments) || 0
            },
            updatedAt: new Date().toISOString()
        });

    } catch (error) {
        console.error(
            "Admin Overview statistics error:",
            error.message
        );

        return res.status(500).json({
            success: false,
            message: "Could not load platform statistics."
        });
    }
});

module.exports = router;
