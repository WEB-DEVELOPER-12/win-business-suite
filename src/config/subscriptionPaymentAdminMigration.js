
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
            resolve(rows);
        });
    });
}

async function getPaymentColumns() {
    const columns = await all(
        "PRAGMA table_info(subscription_payments)"
    );

    return new Set(columns.map(column => column.name));
}

async function migrateSubscriptionPaymentAdmin() {
    await run("BEGIN IMMEDIATE");

    try {
        const tables = await all(`
            SELECT name
            FROM sqlite_master
            WHERE type = 'table'
              AND name IN (
                  'subscription_payments',
                  'admin_users'
              )
        `);

        const existingTables = new Set(
            tables.map(table => table.name)
        );

        if (!existingTables.has("subscription_payments")) {
            throw new Error(
                "The subscription_payments table does not exist."
            );
        }

        if (!existingTables.has("admin_users")) {
            throw new Error(
                "The admin_users table does not exist. " +
                "Run the admin database migration first."
            );
        }

        let columns = await getPaymentColumns();

        if (!columns.has("reviewed_at")) {
            await run(`
                ALTER TABLE subscription_payments
                ADD COLUMN reviewed_at DATETIME
            `);
        }

        if (!columns.has("reviewed_by_admin_id")) {
            await run(`
                ALTER TABLE subscription_payments
                ADD COLUMN reviewed_by_admin_id INTEGER
                REFERENCES admin_users(id)
                ON DELETE SET NULL
            `);
        }

        if (!columns.has("review_reason")) {
            await run(`
                ALTER TABLE subscription_payments
                ADD COLUMN review_reason TEXT
            `);
        }

        await run(`
            CREATE INDEX IF NOT EXISTS
            idx_subscription_payments_status_date
            ON subscription_payments (
                status,
                submitted_at DESC
            )
        `);

        await run(`
            CREATE INDEX IF NOT EXISTS
            idx_subscription_payments_business_date
            ON subscription_payments (
                business_id,
                submitted_at DESC
            )
        `);

        await run("COMMIT");

        console.log(
            "WIN subscription payment admin migration completed."
        );
        console.log("Administrator review tracking: enabled.");
        console.log("Payment review reasons: enabled.");
        console.log("Payment request indexes: enabled.");

    } catch (error) {
        try {
            await run("ROLLBACK");
        } catch (rollbackError) {
            console.error(
                "Payment migration rollback failed:",
                rollbackError.message
            );
        }

        throw error;
    }
}

module.exports = migrateSubscriptionPaymentAdmin;
