
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

async function getSubscriptionColumns() {
    const columns = await all("PRAGMA table_info(subscriptions)");

    return new Set(columns.map(column => column.name));
}

async function migrateSubscriptionAdmin() {
    await run("BEGIN IMMEDIATE");

    try {
        const tables = await all(`
            SELECT name
            FROM sqlite_master
            WHERE type = 'table'
              AND name = 'subscriptions'
        `);

        if (tables.length === 0) {
            throw new Error(
                "The subscriptions table does not exist."
            );
        }

        let columns = await getSubscriptionColumns();

        if (!columns.has("billing_cycle")) {
            await run(`
                ALTER TABLE subscriptions
                ADD COLUMN billing_cycle TEXT
                CHECK (
                    billing_cycle IS NULL
                    OR billing_cycle IN ('monthly', 'annual')
                )
            `);
        }

        if (!columns.has("activation_type")) {
            await run(`
                ALTER TABLE subscriptions
                ADD COLUMN activation_type TEXT
                CHECK (
                    activation_type IS NULL
                    OR activation_type IN ('manual', 'complimentary')
                )
            `);
        }

        await run(`
            CREATE INDEX IF NOT EXISTS
            idx_subscriptions_status_expiry
            ON subscriptions (status, current_period_end)
        `);

        await run(`
            CREATE INDEX IF NOT EXISTS
            idx_subscriptions_billing_cycle
            ON subscriptions (billing_cycle)
        `);

        await run("COMMIT");

        console.log(
            "WIN subscription admin migration completed."
        );
        console.log("Subscription billing cycle tracking: enabled.");
        console.log("Subscription activation type tracking: enabled.");

    } catch (error) {
        try {
            await run("ROLLBACK");
        } catch (rollbackError) {
            console.error(
                "Subscription migration rollback failed:",
                rollbackError.message
            );
        }

        throw error;
    }
}

module.exports = migrateSubscriptionAdmin;
