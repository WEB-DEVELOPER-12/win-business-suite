
const db = require("../config/database");

function requireSubscription(req, res, next) {
    const businessId = req.session?.user?.business_id;

    if (!businessId) {
        return res.status(401).json({
            success: false,
            message: "Please log in to continue."
        });
    }

    db.get(
        `SELECT
            status,
            trial_ends_at,
            current_period_end
         FROM subscriptions
         WHERE business_id = ?`,
        [businessId],
        (error, subscription) => {
            if (error) {
                console.error(
                    "Subscription authorization error:",
                    error.message
                );

                return res.status(500).json({
                    success: false,
                    message: "Could not verify your subscription."
                });
            }

            if (!subscription) {
                return res.status(403).json({
                    success: false,
                    code: "SUBSCRIPTION_REQUIRED",
                    message: "Please start your free trial to access this feature."
                });
            }

            // Lifetime access must be assigned directly in the database.
            if (subscription.status === "founder") {
                return next();
            }

            // Trial access is valid only until its recorded expiry.
            if (
                subscription.status === "trial" &&
                subscription.trial_ends_at
            ) {
                return db.get(
                    `SELECT
                        datetime(?) > datetime('now') AS is_valid`,
                    [subscription.trial_ends_at],
                    (dateError, result) => {
                        if (dateError) {
                            console.error(
                                "Trial expiry check error:",
                                dateError.message
                            );

                            return res.status(500).json({
                                success: false,
                                message: "Could not verify your trial."
                            });
                        }

                        if (result?.is_valid === 1) {
                            return next();
                        }

                        return res.status(403).json({
                            success: false,
                            code: "SUBSCRIPTION_EXPIRED",
                            message: "Your free trial has expired. Upgrade to continue."
                        });
                    }
                );
            }

            // Paid access is valid only until its recorded period end.
            if (
                subscription.status === "active" &&
                subscription.current_period_end
            ) {
                return db.get(
                    `SELECT
                        datetime(?) > datetime('now') AS is_valid`,
                    [subscription.current_period_end],
                    (dateError, result) => {
                        if (dateError) {
                            console.error(
                                "Subscription expiry check error:",
                                dateError.message
                            );

                            return res.status(500).json({
                                success: false,
                                message: "Could not verify your subscription."
                            });
                        }

                        if (result?.is_valid === 1) {
                            return next();
                        }

                        return res.status(403).json({
                            success: false,
                            code: "SUBSCRIPTION_EXPIRED",
                            message: "Your subscription has expired. Please upgrade to continue."
                        });
                    }
                );
            }

            return res.status(403).json({
                success: false,
                code: "SUBSCRIPTION_REQUIRED",
                message: "Start your free trial or upgrade to access this feature."
            });
        }
    );
}

module.exports = requireSubscription;
