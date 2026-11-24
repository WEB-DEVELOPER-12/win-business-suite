
"use strict";

const db = require("./database");

function run(sql, params = []) {
    return new Promise((resolve, reject) => {
        db.run(sql, params, function (error) {
            if (error) return reject(error);
            resolve(this);
        });
    });
}

function all(sql, params = []) {
    return new Promise((resolve, reject) => {
        db.all(sql, params, (error, rows) => {
            if (error) return reject(error);
            resolve(rows || []);
        });
    });
}

async function addDisplayCategoryIfMissing() {
    const columns = await all(
        "PRAGMA table_info(platform_announcements)"
    );

    if (columns.length === 0) {
        throw new Error(
            "platform_announcements table does not exist. Run the notifications migration first."
        );
    }

    const exists = columns.some(
        column => column.name === "display_category"
    );

    if (exists) {
        return false;
    }

    await run(`
        ALTER TABLE platform_announcements
        ADD COLUMN display_category TEXT NOT NULL
        DEFAULT 'general'
        CHECK (
            display_category IN (
                'maintenance',
                'announcements',
                'welcome',
                'subscription',
                'general'
            )
        )
    `);

    console.log(
        "Admin notification display_category column added."
    );

    return true;
}

async function migrateAdminNotifications() {
    await run("BEGIN IMMEDIATE");

    try {
        const added = await addDisplayCategoryIfMissing();

        // Backfill existing campaigns only when the column is first created.
        // This prevents future restarts from overwriting administrator choices.
        if (added) {
            await run(`
                UPDATE platform_announcements
                SET display_category = CASE
                    WHEN category = 'maintenance'
                        THEN 'maintenance'

                    WHEN category = 'subscription'
                        THEN 'subscription'

                    WHEN category = 'platform_announcement'
                        THEN 'announcements'

                    ELSE 'general'
                END
            `);
        }

        await run(`
            CREATE INDEX IF NOT EXISTS
            idx_platform_announcements_display_category
            ON platform_announcements (
                display_category,
                status,
                publish_at
            )
        `);

        await run("COMMIT");

        console.log(
            "WIN Admin Notifications migration completed."
        );

    } catch (error) {
        try {
            await run("ROLLBACK");
        } catch (rollbackError) {
            console.error(
                "Admin Notifications migration rollback failed:",
                rollbackError.message
            );
        }

        throw error;
    }
}

module.exports = migrateAdminNotifications;
