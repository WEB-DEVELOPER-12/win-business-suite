
const db = require("./database");

function run(sql, params = []) {
    return new Promise((resolve, reject) => {
        db.run(sql, params, function (error) {
            if (error) return reject(error);
            resolve(this);
        });
    });
}

async function migrateNotifications() {
    await run("BEGIN IMMEDIATE");

    try {
        // Individual notifications belonging to each user.
        await run(`
            CREATE TABLE IF NOT EXISTS user_notifications (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL,

                category TEXT NOT NULL CHECK (
                    category IN (
                        'general',
                        'maintenance',
                        'welcome',
                        'subscription',
                        'security',
                        'payment',
                        'feature_update',
                        'service_status',
                        'platform_announcement',
                        'policy_update'
                    )
                ),

                title TEXT NOT NULL,
                message TEXT NOT NULL,

                importance TEXT NOT NULL DEFAULT 'medium'
                    CHECK (
                        importance IN (
                            'critical',
                            'high',
                            'medium',
                            'low'
                        )
                    ),

                action_label TEXT,
                action_url TEXT,

                is_permanent INTEGER NOT NULL DEFAULT 0
                    CHECK (is_permanent IN (0, 1)),

                dedupe_key TEXT,

                read_at DATETIME,
                dismissed_at DATETIME,
                expires_at DATETIME,

                created_at DATETIME NOT NULL
                    DEFAULT CURRENT_TIMESTAMP,

                FOREIGN KEY (user_id) REFERENCES users(id)
                    ON DELETE CASCADE,

                UNIQUE (user_id, dedupe_key)
            )
        `);

        // Platform-wide announcements for future admin management.
        await run(`
            CREATE TABLE IF NOT EXISTS platform_announcements (
                id INTEGER PRIMARY KEY AUTOINCREMENT,

                category TEXT NOT NULL CHECK (
                    category IN (
                        'general',
                        'maintenance',
                        'subscription',
                        'security',
                        'payment',
                        'feature_update',
                        'service_status',
                        'platform_announcement',
                        'policy_update'
                    )
                ),

                title TEXT NOT NULL,
                message TEXT NOT NULL,

                importance TEXT NOT NULL DEFAULT 'medium'
                    CHECK (
                        importance IN (
                            'critical',
                            'high',
                            'medium',
                            'low'
                        )
                    ),

                audience_type TEXT NOT NULL DEFAULT 'all'
                    CHECK (
                        audience_type IN (
                            'all',
                            'trial',
                            'active',
                            'pending',
                            'selected_users',
                            'business_type'
                        )
                    ),

                audience_value TEXT,

                action_label TEXT,
                action_url TEXT,

                publish_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                expires_at DATETIME,

                is_permanent INTEGER NOT NULL DEFAULT 0
                    CHECK (is_permanent IN (0, 1)),

                status TEXT NOT NULL DEFAULT 'draft'
                    CHECK (
                        status IN (
                            'draft',
                            'scheduled',
                            'published',
                            'cancelled',
                            'archived'
                        )
                    ),

                created_by INTEGER,
                published_at DATETIME,
                created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // Indexes for notification performance.
        const indexes = [
            `CREATE INDEX IF NOT EXISTS idx_user_notifications_user_date
             ON user_notifications (user_id, created_at DESC)`,

            `CREATE INDEX IF NOT EXISTS idx_user_notifications_unread
             ON user_notifications (user_id, read_at, created_at DESC)`,

            `CREATE INDEX IF NOT EXISTS idx_user_notifications_category
             ON user_notifications (user_id, category, created_at DESC)`,

            `CREATE INDEX IF NOT EXISTS idx_user_notifications_expiry
             ON user_notifications (expires_at)`,

            `CREATE INDEX IF NOT EXISTS idx_user_notifications_dismissed
             ON user_notifications (user_id, dismissed_at)`,

            `CREATE INDEX IF NOT EXISTS idx_announcements_status_date
             ON platform_announcements (status, publish_at)`,

            `CREATE INDEX IF NOT EXISTS idx_announcements_expiry
             ON platform_announcements (expires_at)`
        ];

        for (const sql of indexes) {
            await run(sql);
        }

        // Automatically create a permanent welcome notification
        // whenever a new user account is registered.
        await run(`
            CREATE TRIGGER IF NOT EXISTS trg_user_welcome_notification
            AFTER INSERT ON users
            BEGIN
                INSERT OR IGNORE INTO user_notifications (
                    user_id,
                    category,
                    title,
                    message,
                    importance,
                    is_permanent,
                    dedupe_key,
                    action_label,
                    action_url
                ) VALUES (
                    NEW.id,
                    'welcome',
                    'Welcome to WIN Business Suite!',
                    'Hello ' || NEW.full_name ||
                    ', welcome to WIN Business Suite! Your account has been created successfully. Verify your email address to complete your account setup.',
                    'medium',
                    1,
                    'welcome:account-created:v1',
                    'Set Up Your Business',
                    '/business-settings.html'
                );
            END
        `);

        // Give existing users a welcome notification too.
        await run(`
            INSERT OR IGNORE INTO user_notifications (
                user_id,
                category,
                title,
                message,
                importance,
                is_permanent,
                dedupe_key,
                action_label,
                action_url
            )
            SELECT
                id,
                'welcome',
                'Welcome to WIN Business Suite!',
                'Hello ' || full_name ||
                ', welcome to WIN Business Suite! Your account is ready. Verify your email address if you have not already done so.',
                'medium',
                1,
                'welcome:account-created:v1',
                'Set Up Your Business',
                '/business-settings.html'
            FROM users
        `);

        // Notify a customer when a subscription request is submitted.
        await run(`
            CREATE TRIGGER IF NOT EXISTS trg_subscription_request_notification
            AFTER INSERT ON subscription_payments
            BEGIN
                INSERT OR IGNORE INTO user_notifications (
                    user_id,
                    category,
                    title,
                    message,
                    importance,
                    dedupe_key,
                    action_label,
                    action_url
                ) VALUES (
                    NEW.user_id,
                    'subscription',
                    'Subscription Request Received',
                    'Your WIN Pro ' || NEW.billing_cycle ||
                    ' subscription request for ' || NEW.currency ||
                    ' ' || NEW.amount ||
                    ' has been received. Its current status is PENDING. We will notify you when it is reviewed.',
                    'medium',
                    'subscription-request:' || NEW.id,
                    'View Subscription',
                    '/upgrade.html'
                );
            END
        `);

        // Notify the customer when their payment status changes.
        await run(`
            CREATE TRIGGER IF NOT EXISTS trg_payment_status_notification
            AFTER UPDATE OF status ON subscription_payments
            WHEN OLD.status != NEW.status
            BEGIN
                INSERT OR IGNORE INTO user_notifications (
                    user_id,
                    category,
                    title,
                    message,
                    importance,
                    dedupe_key,
                    action_label,
                    action_url
                ) VALUES (
                    NEW.user_id,
                    'payment',
                    CASE
                        WHEN lower(NEW.status) IN (
                            'paid', 'successful', 'completed',
                            'verified', 'approved'
                        ) THEN 'Payment Confirmed'
                        WHEN lower(NEW.status) = 'failed'
                            THEN 'Payment Failed'
                        WHEN lower(NEW.status) = 'refunded'
                            THEN 'Payment Refunded'
                        ELSE 'Payment Status Updated'
                    END,
                    'Your WIN Pro payment request status has changed to: ' ||
                    upper(NEW.status) || '.',
                    CASE
                        WHEN lower(NEW.status) = 'failed'
                            THEN 'high'
                        ELSE 'medium'
                    END,
                    'payment-status:' || NEW.id || ':' || NEW.status,
                    'View Subscription',
                    '/upgrade.html'
                );
            END
        `);

        // Notify users when a free trial starts.
        await run(`
            CREATE TRIGGER IF NOT EXISTS trg_subscription_trial_notification
            AFTER UPDATE OF status ON subscriptions
            WHEN OLD.status != NEW.status AND NEW.status = 'trial'
            BEGIN
                INSERT OR IGNORE INTO user_notifications (
                    user_id,
                    category,
                    title,
                    message,
                    importance,
                    dedupe_key,
                    action_label,
                    action_url
                )
                SELECT
                    id,
                    'subscription',
                    'Your WIN Pro Free Trial Has Started!',
                    'Your 7-day WIN Pro free trial has started. Your recorded trial expiry is ' ||
                    COALESCE(NEW.trial_ends_at, 'to be confirmed') || '. Enjoy WIN Business Suite!',
                    'medium',
                    'subscription-trial:' || NEW.business_id || ':' ||
                    COALESCE(NEW.trial_started_at, CURRENT_TIMESTAMP),
                    'View Subscription',
                    '/upgrade.html'
                FROM users
                WHERE business_id = NEW.business_id;
            END
        `);

        // Notify users when a paid subscription becomes active.
        await run(`
            CREATE TRIGGER IF NOT EXISTS trg_subscription_active_notification
            AFTER UPDATE OF status ON subscriptions
            WHEN OLD.status != NEW.status AND NEW.status = 'active'
            BEGIN
                INSERT OR IGNORE INTO user_notifications (
                    user_id,
                    category,
                    title,
                    message,
                    importance,
                    dedupe_key,
                    action_label,
                    action_url
                )
                SELECT
                    id,
                    'subscription',
                    'Your WIN Pro Subscription Is Active!',
                    'Your WIN Pro subscription has been activated successfully. Thank you for choosing WIN Business Suite.',
                    'high',
                    'subscription-active:' || NEW.business_id || ':' ||
                    COALESCE(NEW.current_period_start, CURRENT_TIMESTAMP),
                    'View Subscription',
                    '/upgrade.html'
                FROM users
                WHERE business_id = NEW.business_id;
            END
        `);

        // Notify users when a subscription expires.
        await run(`
            CREATE TRIGGER IF NOT EXISTS trg_subscription_expired_notification
            AFTER UPDATE OF status ON subscriptions
            WHEN OLD.status != NEW.status AND NEW.status = 'expired'
            BEGIN
                INSERT OR IGNORE INTO user_notifications (
                    user_id,
                    category,
                    title,
                    message,
                    importance,
                    dedupe_key,
                    action_label,
                    action_url
                )
                SELECT
                    id,
                    'subscription',
                    'Your WIN Pro Subscription Has Expired',
                    'Your subscription has expired. Review your available plans to restore access to paid features.',
                    'high',
                    'subscription-expired:' || NEW.business_id || ':' ||
                    CURRENT_TIMESTAMP,
                    'View Plans',
                    '/upgrade.html'
                FROM users
                WHERE business_id = NEW.business_id;
            END
        `);

        await run("COMMIT");

        console.log("WIN notifications database migration completed.");
        console.log("Automatic welcome notifications: enabled.");
        console.log("Subscription notifications: enabled.");
        console.log("Payment status notifications: enabled.");

    } catch (error) {
        try {
            await run("ROLLBACK");
        } catch (rollbackError) {
            console.error(
                "Notification migration rollback failed:",
                rollbackError.message
            );
        }

        throw error;
    }
}

module.exports = migrateNotifications;
