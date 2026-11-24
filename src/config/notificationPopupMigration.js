
const db = require("./database");

function run(sql, params = []) {
    return new Promise((resolve, reject) => {
        db.run(sql, params, function (error) {
            if (error) return reject(error);
            resolve(this);
        });
    });
}

function all(sql) {
    return new Promise((resolve, reject) => {
        db.all(sql, [], (error, rows) => {
            if (error) return reject(error);
            resolve(rows || []);
        });
    });
}

async function addColumnIfMissing(columnName, columnDefinition) {
    const columns = await all("PRAGMA table_info(user_notifications)");

    const exists = columns.some(column => column.name === columnName);

    if (!exists) {
        await run(
            `ALTER TABLE user_notifications ADD COLUMN ${columnName} ${columnDefinition}`
        );

        console.log(`Notification popup column added: ${columnName}`);
    }
}

async function migrateNotificationPopups() {
    await run("BEGIN IMMEDIATE");

    try {
        await addColumnIfMissing("popup_shown_at", "DATETIME");
        await addColumnIfMissing("popup_dismissed_at", "DATETIME");

        await run(`
            CREATE INDEX IF NOT EXISTS idx_notification_popup_queue
            ON user_notifications (
                user_id,
                read_at,
                popup_shown_at,
                created_at
            )
        `);

        await run("COMMIT");

        console.log("WIN notification popup migration completed.");
        console.log("One-time notification popup tracking: enabled.");

    } catch (error) {
        try {
            await run("ROLLBACK");
        } catch (rollbackError) {
            console.error("Popup migration rollback failed:", rollbackError.message);
        }

        throw error;
    }
}

module.exports = migrateNotificationPopups;
