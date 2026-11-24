"use strict";

const pool = require("../config/postgresDatabase");
const requireAuth = require("./requireAuth");

function requireSubscription(req, res, next) {
    // Verify the session and email status before checking subscription access.
    return requireAuth(req, res, async () => {
        const businessId = req.session?.user?.business_id;

        if (!businessId) {
            return res.status(401).json({
                success: false,
                message: "Please log in to continue."
            });
        }

        try {
            const result = await pool.query(
                `SELECT
                    status,
                    trial_ends_at,
                    current_period_end
                 FROM subscriptions
                 WHERE business_id = $1
                 LIMIT 1`,
                [businessId]
            );

            const subscription = result.rows[0];

            if (!subscription) {
                return res.status(403).json({
                    success: false,
                    code: "SUBSCRIPTION_REQUIRED",
                    message: "Please start your free trial to access this feature."
                });
            }

            // Founder accounts receive lifetime access.
            if (subscription.status === "founder") {
                return next();
            }

            // Trial access is valid only until its recorded expiry.
            if (
                subscription.status === "trial" &&
                subscription.trial_ends_at
            ) {
                const expiryResult = await pool.query(
                    `SELECT
                        $1::timestamptz > CURRENT_TIMESTAMP AS is_valid`,
                    [subscription.trial_ends_at]
                );

                if (expiryResult.rows[0]?.is_valid === true) {
                    return next();
                }

                return res.status(403).json({
                    success: false,
                    code: "SUBSCRIPTION_EXPIRED",
                    message: "Your free trial has expired. Upgrade to continue."
                });
            }

            // Paid access is valid only until its recorded period end.
            if (
                subscription.status === "active" &&
                subscription.current_period_end
            ) {
                const expiryResult = await pool.query(
                    `SELECT
                        $1::timestamptz > CURRENT_TIMESTAMP AS is_valid`,
                    [subscription.current_period_end]
                );

                if (expiryResult.rows[0]?.is_valid === true) {
                    return next();
                }

                return res.status(403).json({
                    success: false,
                    code: "SUBSCRIPTION_EXPIRED",
                    message: "Your subscription has expired. Please upgrade to continue."
                });
            }

            return res.status(403).json({
                success: false,
                code: "SUBSCRIPTION_REQUIRED",
                message: "Start your free trial or upgrade to access this feature."
            });

        } catch (error) {
            console.error(
                "Subscription authorization error:",
                error.message
            );

            return res.status(500).json({
                success: false,
                message: "Could not verify your subscription."
            });
        }
    });
}

module.exports = requireSubscription;