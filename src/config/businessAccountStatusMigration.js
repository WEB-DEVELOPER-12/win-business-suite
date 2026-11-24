
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

async function migrateBusinessAccountStatus() {
    const columns = await all("PRAGMA table_info(businesses)");

    const existingColumns = new Set(
        columns.map(column => column.name)
    );

    const upgrades = [
        {
            name: "account_status",
            sql: `
                ALTER TABLE businesses
                ADD COLUMN account_status TEXT NOT NULL
                DEFAULT 'active'
                CHECK (account_status IN ('active', 'suspended'))
            `
        },
        {
            name: "suspension_reason",
            sql: `
                ALTER TABLE businesses
                ADD COLUMN suspension_reason TEXT
            `
        },
        {
            name: "suspended_at",
            sql: `
                ALTER TABLE businesses
                ADD COLUMN suspended_at DATETIME
            `
        },
        {
            name: "suspended_by_admin_id",
            sql: `
                ALTER TABLE businesses
                ADD COLUMN suspended_by_admin_id INTEGER
            `
        }
    ];

    await run("BEGIN IMMEDIATE");

    try {
        for (const upgrade of upgrades) {
            if (existingColumns.has(upgrade.name)) {
                continue;
            }

            await run(upgrade.sql);

            console.log(
                `Business account status column added: ${upgrade.name}`
            );
        }

        await run(`
            CREATE INDEX IF NOT EXISTS idx_businesses_account_status
            ON businesses (account_status, created_at)
        `);

        await run("COMMIT");

        console.log(
            "Business account status migration completed."
        );

        console.log(
            "Default existing business account status: active"
        );

    } catch (error) {
        try {
            await run("ROLLBACK");
        } catch (rollbackError) {
            console.error(
                "Business account status rollback failed:",
                rollbackError.message
            );
        }

        throw error;
    }
}

module.exports = migrateBusinessAccountStatus;
