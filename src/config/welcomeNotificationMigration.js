
const db = require("./database");

function run(sql, params = []) {
    return new Promise((resolve, reject) => {
        db.run(sql, params, function (error) {
            if (error) return reject(error);
            resolve(this);
        });
    });
}

async function migrateWelcomeNotifications() {
    await run("BEGIN IMMEDIATE");

    try {
        // Replace the old welcome trigger with the improved message.
        await run(`
            DROP TRIGGER IF EXISTS trg_user_welcome_notification
        `);

        await run(`
            CREATE TRIGGER trg_user_welcome_notification
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
                    ', we are delighted to have you as part of WIN Business Suite! Thank you for choosing WIN to manage your business. We are here to help you simplify your daily operations, understand your business performance and grow with confidence. Get started by setting up your business profile and exploring the tools available to you. Manage Everything. Grow Smarter.',
                    'medium',
                    1,
                    'welcome:account-created:v1',
                    'Set Up Your Business',
                    '/business-settings.html'
                );
            END
        `);

        // Update existing welcome messages without creating duplicates.
        await run(`
            UPDATE user_notifications
            SET message = (
                SELECT
                    'Hello ' || users.full_name ||
                    ', we are delighted to have you as part of WIN Business Suite! Thank you for choosing WIN to manage your business. We are here to help you simplify your daily operations, understand your business performance and grow with confidence. Get started by setting up your business profile and exploring the tools available to you. Manage Everything. Grow Smarter.'
                FROM users
                WHERE users.id = user_notifications.user_id
            ),
            title = 'Welcome to WIN Business Suite!',
            action_label = 'Set Up Your Business',
            action_url = '/business-settings.html'
            WHERE category = 'welcome'
              AND dedupe_key = 'welcome:account-created:v1'
              AND EXISTS (
                  SELECT 1
                  FROM users
                  WHERE users.id = user_notifications.user_id
              )
        `);

        await run("COMMIT");

        console.log("WIN welcome notification migration completed.");
        console.log("New welcome message activated.");
        console.log("Existing welcome messages updated without duplicates.");

    } catch (error) {
        try {
            await run("ROLLBACK");
        } catch (rollbackError) {
            console.error(
                "Welcome notification rollback failed:",
                rollbackError.message
            );
        }

        throw error;
    }
}

module.exports = migrateWelcomeNotifications;
