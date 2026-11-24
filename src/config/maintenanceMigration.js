
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

async function migrateMaintenance() {
    await run("BEGIN IMMEDIATE");

    try {
        await run(`
            CREATE TABLE IF NOT EXISTS platform_maintenance (
                id INTEGER PRIMARY KEY
                    CHECK (id = 1),

                maintenance_enabled INTEGER NOT NULL
                    DEFAULT 0
                    CHECK (maintenance_enabled IN (0, 1)),

                message TEXT NOT NULL
                    DEFAULT 'WIN Business Suite is temporarily undergoing maintenance. We will be back soon.',

                reason TEXT,

                expected_return_at TEXT,

                schedule_enabled INTEGER NOT NULL
                    DEFAULT 0
                    CHECK (schedule_enabled IN (0, 1)),

                scheduled_start_at TEXT,

                scheduled_end_at TEXT,

                last_changed_by INTEGER,

                activated_at TEXT,

                created_at TEXT NOT NULL
                    DEFAULT CURRENT_TIMESTAMP,

                updated_at TEXT NOT NULL
                    DEFAULT CURRENT_TIMESTAMP,

                CHECK (
                    scheduled_start_at IS NULL
                    OR scheduled_end_at IS NULL
                    OR scheduled_end_at > scheduled_start_at
                )
            )
        `);

        await run(`
            INSERT OR IGNORE INTO platform_maintenance (
                id,
                maintenance_enabled,
                message,
                schedule_enabled
            )
            VALUES (
                1,
                0,
                'WIN Business Suite is temporarily undergoing maintenance. We will be back soon.',
                0
            )
        `);

        await run(`
            CREATE TABLE IF NOT EXISTS maintenance_events (
                id INTEGER PRIMARY KEY AUTOINCREMENT,

                event_type TEXT NOT NULL,

                admin_user_id INTEGER,

                previous_state_json TEXT,

                new_state_json TEXT,

                details TEXT,

                created_at TEXT NOT NULL
                    DEFAULT CURRENT_TIMESTAMP
            )
        `);

        await run(`
            CREATE INDEX IF NOT EXISTS
            idx_maintenance_events_created_at
            ON maintenance_events (created_at DESC)
        `);

        await run(`
            CREATE INDEX IF NOT EXISTS
            idx_maintenance_events_type
            ON maintenance_events (event_type, created_at DESC)
        `);

        await run("COMMIT");

        console.log(
            "WIN Maintenance migration completed."
        );

    } catch (error) {
        try {
            await run("ROLLBACK");
        } catch (rollbackError) {
            console.error(
                "Maintenance migration rollback failed:",
                rollbackError.message
            );
        }

        throw error;
    }
}

module.exports = migrateMaintenance;
