
const express = require("express");
const pool = require("../config/postgresDatabase");
const requireAuth = require("../middleware/requireAuth");

const router = express.Router();

router.use(requireAuth);

// GET CURRENT BUSINESS SUBSCRIPTION
router.get("/", async (req, res) => {
    const businessId = req.session.user.business_id;

    try {
        const result = await pool.query(
            `SELECT
                business_id,
                plan_name,
                status,
                trial_started_at,
                trial_ends_at,
                current_period_start,
                current_period_end,
                CASE
                    WHEN status = 'trial'
                         AND NULLIF(trial_ends_at::text, '') IS NOT NULL
                         AND NULLIF(trial_ends_at::text, '')::timestamptz <= CURRENT_TIMESTAMP
                    THEN 'expired'
                    WHEN status = 'active'
                         AND NULLIF(current_period_end::text, '') IS NOT NULL
                         AND NULLIF(current_period_end::text, '')::timestamptz <= CURRENT_TIMESTAMP
                    THEN 'expired'
                    ELSE status
                END AS current_status,
                CASE
                    WHEN status = 'trial'
                         AND NULLIF(trial_ends_at::text, '') IS NOT NULL
                    THEN GREATEST(
                        0,
                        FLOOR(EXTRACT(EPOCH FROM (
                            NULLIF(trial_ends_at::text, '')::timestamptz - CURRENT_TIMESTAMP
                        )))::integer
                    )
                    WHEN status = 'active'
                         AND NULLIF(current_period_end::text, '') IS NOT NULL
                    THEN GREATEST(
                        0,
                        FLOOR(EXTRACT(EPOCH FROM (
                            NULLIF(current_period_end::text, '')::timestamptz - CURRENT_TIMESTAMP
                        )))::integer
                    )
                    ELSE 0
                END AS remaining_seconds
             FROM subscriptions
             WHERE business_id = $1`,
            [businessId]
        );

        const subscription = result.rows[0];

        if (!subscription) {
            return res.status(404).json({
                success: false,
                message: "No subscription record was found for this business."
            });
        }

        return res.json({
            success: true,
            subscription: {
                business_id: subscription.business_id,
                plan_name: subscription.plan_name,
                status: subscription.current_status,
                trial_started_at: subscription.trial_started_at,
                trial_ends_at: subscription.trial_ends_at,
                current_period_start: subscription.current_period_start,
                current_period_end: subscription.current_period_end,
                remaining_seconds: Number(subscription.remaining_seconds)
            }
        });
    } catch (error) {
        console.error("Subscription lookup error:", error.message);

        return res.status(500).json({
            success: false,
            message: "Could not load subscription information."
        });
    }
});

// START THE 7-DAY FREE TRIAL
router.post("/start-trial", async (req, res) => {
    const businessId = req.session.user.business_id;

    try {
        const result = await pool.query(
            `UPDATE subscriptions
             SET
                status = 'trial',
                trial_started_at = CURRENT_TIMESTAMP::text,
                trial_ends_at = (CURRENT_TIMESTAMP + INTERVAL '7 days')::text
             WHERE business_id = $1
               AND status = 'pending'
               AND trial_started_at IS NULL
               AND trial_ends_at IS NULL
             RETURNING business_id`,
            [businessId]
        );

        if (result.rowCount === 0) {
            const lookup = await pool.query(
                `SELECT status, trial_started_at, trial_ends_at
                 FROM subscriptions
                 WHERE business_id = $1`,
                [businessId]
            );

            const subscription = lookup.rows[0];

            if (!subscription) {
                return res.status(404).json({
                    success: false,
                    message: "No subscription record was found."
                });
            }

            return res.status(409).json({
                success: false,
                message: "Your trial cannot be started again.",
                subscription
            });
        }

        return res.json({
            success: true,
            message: "Your 7-day WIN Pro free trial has started.",
            trial_duration_days: 7
        });
    } catch (error) {
        console.error("Trial activation error:", error.message);

        return res.status(500).json({
            success: false,
            message: "Could not start your free trial."
        });
    }
});

// LOAD COMPLETE UPGRADE REQUEST DETAILS
async function returnUpgradeRequest(res, requestId, businessId, alreadyExists) {
    try {
        const result = await pool.query(
            `SELECT
                sp.id AS request_id,
                sp.business_id,
                sp.user_id,
                sp.plan_name,
                sp.billing_cycle,
                sp.amount,
                sp.currency,
                sp.status AS payment_status,
                sp.submitted_at,
                u.full_name AS customer_name,
                u.email AS customer_email,
                b.business_name,
                b.business_type,
                b.email AS business_email,
                b.phone AS business_phone,
                b.country AS business_country
             FROM subscription_payments sp
             INNER JOIN users u ON sp.user_id = u.id
             INNER JOIN businesses b ON sp.business_id = b.id
             WHERE sp.id = $1
               AND sp.business_id = $2`,
            [requestId, businessId]
        );

        const request = result.rows[0];

        if (!request) {
            return res.status(404).json({
                success: false,
                message: "Upgrade request details could not be found."
            });
        }

        return res.status(alreadyExists ? 200 : 201).json({
            success: true,
            already_exists: alreadyExists,
            message: alreadyExists
                ? "Your existing upgrade request is ready to continue on WhatsApp."
                : "Your upgrade request has been saved. Continue on WhatsApp.",
            request
        });
    } catch (error) {
        console.error("Upgrade request details error:", error.message);

        return res.status(500).json({
            success: false,
            message: "The request was saved, but its details could not be loaded."
        });
    }
}

// CREATE OR REUSE WIN PRO UPGRADE REQUEST
router.post("/request", async (req, res) => {
    const businessId = req.session.user.business_id;
    const userId = req.session.user.id;
    const billingCycle = req.body.billing_cycle;

    const plans = {
        monthly: 1000,
        annual: 10000
    };

    if (!plans[billingCycle]) {
        return res.status(400).json({
            success: false,
            message: "Please select a valid billing cycle."
        });
    }

    const amount = plans[billingCycle];
    const client = await pool.connect();

    try {
        await client.query("BEGIN");

        // Serialize requests for the same business and billing cycle.
        await client.query(
            "SELECT pg_advisory_xact_lock(hashtext($1), hashtext($2))",
            [String(businessId), billingCycle]
        );

        const existingResult = await client.query(
            `SELECT id
             FROM subscription_payments
             WHERE business_id = $1
               AND billing_cycle = $2
               AND status = 'pending'
             ORDER BY id DESC
             LIMIT 1`,
            [businessId, billingCycle]
        );

        if (existingResult.rows.length > 0) {
            const existingRequestId = existingResult.rows[0].id;

            await client.query("COMMIT");
            client.release();

            return returnUpgradeRequest(
                res,
                existingRequestId,
                businessId,
                true
            );
        }

        const insertResult = await client.query(
            `INSERT INTO subscription_payments (
                business_id,
                user_id,
                plan_name,
                billing_cycle,
                amount,
                currency,
                status
             ) VALUES ($1, $2, 'WIN Pro', $3, $4, 'KES', 'pending')
             RETURNING id`,
            [businessId, userId, billingCycle, amount]
        );

        const requestId = insertResult.rows[0].id;

        await client.query("COMMIT");
        client.release();

        return returnUpgradeRequest(
            res,
            requestId,
            businessId,
            false
        );
    } catch (error) {
        try {
            await client.query("ROLLBACK");
        } catch (rollbackError) {
            console.error("Upgrade request rollback error:", rollbackError.message);
        }

        client.release();

        console.error("Upgrade request creation error:", error.message);

        return res.status(500).json({
            success: false,
            message: "Could not save your upgrade request."
        });
    }
});

// SAVE A SUPPORT MESSAGE
router.post("/support", async (req, res) => {
    const businessId = req.session.user.business_id;
    const userId = req.session.user.id;

    const subject = String(req.body.subject || "").trim();
    const message = String(req.body.message || "").trim();

    if (!subject || !message) {
        return res.status(400).json({
            success: false,
            message: "Please provide both a subject and a message."
        });
    }

    if (subject.length > 150 || message.length > 5000) {
        return res.status(400).json({
            success: false,
            message: "Your subject or message is too long."
        });
    }

    try {
        const result = await pool.query(
            `INSERT INTO support_messages (
                business_id,
                user_id,
                subject,
                message,
                status
             ) VALUES ($1, $2, $3, $4, 'open')
             RETURNING id`,
            [businessId, userId, subject, message]
        );

        return res.status(201).json({
            success: true,
            message: "Your support message has been received.",
            message_id: result.rows[0].id
        });
    } catch (error) {
        console.error("Support message error:", error.message);

        return res.status(500).json({
            success: false,
            message: "Could not send your support message."
        });
    }
});

module.exports = router;
