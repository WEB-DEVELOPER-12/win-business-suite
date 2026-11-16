
const express = require("express");
const db = require("../config/database");
const requireAuth = require("../middleware/requireAuth");

const router = express.Router();

router.use(requireAuth);

// GET CURRENT BUSINESS SUBSCRIPTION
router.get("/", (req, res) => {
    const businessId = req.session.user.business_id;

    db.get(
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
                     AND trial_ends_at IS NOT NULL
                     AND datetime(trial_ends_at) <= datetime('now')
                THEN 'expired'
                WHEN status = 'active'
                     AND current_period_end IS NOT NULL
                     AND datetime(current_period_end) <= datetime('now')
                THEN 'expired'
                ELSE status
            END AS current_status,
            CASE
                WHEN status = 'trial'
                     AND trial_ends_at IS NOT NULL
                THEN MAX(
                    0,
                    CAST(
                        (julianday(trial_ends_at) - julianday('now')) * 86400
                        AS INTEGER
                    )
                )
                WHEN status = 'active'
                     AND current_period_end IS NOT NULL
                THEN MAX(
                    0,
                    CAST(
                        (julianday(current_period_end) - julianday('now')) * 86400
                        AS INTEGER
                    )
                )
                ELSE 0
            END AS remaining_seconds
         FROM subscriptions
         WHERE business_id = ?`,
        [businessId],
        (error, subscription) => {
            if (error) {
                console.error("Subscription lookup error:", error.message);

                return res.status(500).json({
                    success: false,
                    message: "Could not load subscription information."
                });
            }

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
                    remaining_seconds: subscription.remaining_seconds
                }
            });
        }
    );
});

// START THE 7-DAY FREE TRIAL
router.post("/start-trial", (req, res) => {
    const businessId = req.session.user.business_id;

    db.run(
        `UPDATE subscriptions
         SET
            status = 'trial',
            trial_started_at = CURRENT_TIMESTAMP,
            trial_ends_at = datetime('now', '+7 days')
         WHERE business_id = ?
           AND status = 'pending'
           AND trial_started_at IS NULL
           AND trial_ends_at IS NULL`,
        [businessId],
        function (error) {
            if (error) {
                console.error("Trial activation error:", error.message);

                return res.status(500).json({
                    success: false,
                    message: "Could not start your free trial."
                });
            }

            if (this.changes === 0) {
                return db.get(
                    `SELECT status, trial_started_at, trial_ends_at
                     FROM subscriptions
                     WHERE business_id = ?`,
                    [businessId],
                    (lookupError, subscription) => {
                        if (lookupError) {
                            console.error(
                                "Trial status lookup error:",
                                lookupError.message
                            );

                            return res.status(500).json({
                                success: false,
                                message: "Could not verify your trial status."
                            });
                        }

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
                );
            }

            return res.json({
                success: true,
                message: "Your 7-day WIN Pro free trial has started.",
                trial_duration_days: 7
            });
        }
    );
});

// LOAD COMPLETE UPGRADE REQUEST DETAILS
function returnUpgradeRequest(res, requestId, alreadyExists) {
    db.get(
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

         INNER JOIN users u
            ON sp.user_id = u.id

         INNER JOIN businesses b
            ON sp.business_id = b.id

         WHERE sp.id = ?
           AND sp.business_id = ?`,
        [requestId, reqBusinessId(res)],
        (error, request) => {
            if (error) {
                console.error(
                    "Upgrade request details error:",
                    error.message
                );

                return res.status(500).json({
                    success: false,
                    message: "The request was saved, but its details could not be loaded."
                });
            }

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
        }
    );
}

// Keep the authenticated business ID available to the response helper.
function reqBusinessId(res) {
    return res.locals.businessId;
}

// CREATE OR REUSE WIN PRO UPGRADE REQUEST
router.post("/request", (req, res) => {
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

    res.locals.businessId = businessId;

    // Reuse an existing pending request for the same plan.
    db.get(
        `SELECT id
         FROM subscription_payments
         WHERE business_id = ?
           AND billing_cycle = ?
           AND status = 'pending'
         LIMIT 1`,
        [businessId, billingCycle],
        (lookupError, existingRequest) => {
            if (lookupError) {
                console.error(
                    "Upgrade request lookup error:",
                    lookupError.message
                );

                return res.status(500).json({
                    success: false,
                    message: "Could not check existing upgrade requests."
                });
            }

            if (existingRequest) {
                returnUpgradeRequest(
                    res,
                    existingRequest.id,
                    true
                );
                return;
            }

            db.run(
                `INSERT INTO subscription_payments (
                    business_id,
                    user_id,
                    plan_name,
                    billing_cycle,
                    amount,
                    currency,
                    status
                ) VALUES (?, ?, 'WIN Pro', ?, ?, 'KES', 'pending')`,
                [businessId, userId, billingCycle, amount],
                function (insertError) {
                    if (insertError) {
                        console.error(
                            "Upgrade request creation error:",
                            insertError.message
                        );

                        return res.status(500).json({
                            success: false,
                            message: "Could not save your upgrade request."
                        });
                    }

                    returnUpgradeRequest(
                        res,
                        this.lastID,
                        false
                    );
                }
            );
        }
    );
});

// SAVE A SUPPORT MESSAGE
router.post("/support", (req, res) => {
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

    db.run(
        `INSERT INTO support_messages (
            business_id,
            user_id,
            subject,
            message,
            status
        ) VALUES (?, ?, ?, ?, 'open')`,
        [businessId, userId, subject, message],
        function (error) {
            if (error) {
                console.error("Support message error:", error.message);

                return res.status(500).json({
                    success: false,
                    message: "Could not send your support message."
                });
            }

            return res.status(201).json({
                success: true,
                message: "Your support message has been received.",
                message_id: this.lastID
            });
        }
    );
});

module.exports = router;
