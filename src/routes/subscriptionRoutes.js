
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

            res.json({
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

// CREATE WIN PRO UPGRADE REQUEST
router.post("/request", (req, res) => {
    const businessId = req.session.user.business_id;
    const userId = req.session.user.id;
    const billingCycle = req.body.billing_cycle;

    const plans = {
        monthly: 2000,
        annual: 20000
    };

    if (!plans[billingCycle]) {
        return res.status(400).json({
            success: false,
            message: "Please select a valid billing cycle."
        });
    }

    const amount = plans[billingCycle];

    // Avoid duplicate pending requests for the same business and plan.
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
                return res.status(409).json({
                    success: false,
                    message: "You already have a pending request for this plan."
                });
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

                    return res.status(201).json({
                        success: true,
                        message: "Your WIN Pro upgrade request has been recorded.",
                        request: {
                            id: this.lastID,
                            business_id: businessId,
                            user_id: userId,
                            plan_name: "WIN Pro",
                            billing_cycle: billingCycle,
                            amount,
                            currency: "KES",
                            status: "pending"
                        }
                    });
                }
            );
        }
    );
});

module.exports = router;
