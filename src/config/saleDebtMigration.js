
const db = require("./database");

function run(sql, params = []) {
    return new Promise((resolve, reject) => {
        db.run(sql, params, function (error) {
            if (error) return reject(error);
            resolve(this);
        });
    });
}

function get(sql, params = []) {
    return new Promise((resolve, reject) => {
        db.get(sql, params, (error, row) => {
            if (error) return reject(error);
            resolve(row);
        });
    });
}

async function migrateSaleDebtSchema() {
    try {
        const columns = await new Promise((resolve, reject) => {
            db.all("PRAGMA table_info(debtor_transactions)", [], (error, rows) => {
                if (error) return reject(error);
                resolve(rows || []);
            });
        });

        const hasSaleId = columns.some(column => column.name === "sale_id");

        if (!hasSaleId) {
            await run(`
                ALTER TABLE debtor_transactions
                ADD COLUMN sale_id INTEGER
                REFERENCES sales(id) ON DELETE SET NULL
            `);
            console.log("Sale–Debtor migration: added sale_id.");
        }

        await run(`
            CREATE TABLE IF NOT EXISTS debtor_payment_allocations (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                business_id INTEGER NOT NULL,
                customer_id INTEGER NOT NULL,
                sale_id INTEGER NOT NULL,
                payment_id INTEGER NOT NULL,
                amount REAL NOT NULL CHECK (amount > 0),
                created_at TEXT DEFAULT CURRENT_TIMESTAMP,

                FOREIGN KEY (business_id)
                    REFERENCES businesses(id) ON DELETE CASCADE,

                FOREIGN KEY (customer_id)
                    REFERENCES customers(id) ON DELETE CASCADE,

                FOREIGN KEY (sale_id)
                    REFERENCES sales(id) ON DELETE CASCADE,

                FOREIGN KEY (payment_id)
                    REFERENCES debtor_payments(id) ON DELETE CASCADE,

                UNIQUE(payment_id, sale_id)
            )
        `);

        await run(`
            CREATE INDEX IF NOT EXISTS idx_debtor_allocations_sale
            ON debtor_payment_allocations(sale_id)
        `);

        await run(`
            CREATE INDEX IF NOT EXISTS idx_debtor_allocations_payment
            ON debtor_payment_allocations(payment_id)
        `);

        await run(`
            CREATE INDEX IF NOT EXISTS idx_debtor_allocations_customer
            ON debtor_payment_allocations(business_id, customer_id)
        `);

        console.log("Sale–Debtor database migration completed.");
    } catch (error) {
        console.error("Sale–Debtor database migration failed:", error.message);
        throw error;
    }
}

module.exports = migrateSaleDebtSchema;
