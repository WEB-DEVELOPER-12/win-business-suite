
const db = require("./database");

function run(sql, params = []) {
    return new Promise((resolve, reject) => {
        db.run(sql, params, function (error) {
            if (error) {
                reject(error);
            } else {
                resolve(this);
            }
        });
    });
}

async function migrateFinance() {
    await run(`
        CREATE TABLE IF NOT EXISTS finance_expenses (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            business_id INTEGER NOT NULL,
            category TEXT NOT NULL,
            description TEXT NOT NULL,
            amount REAL NOT NULL CHECK (amount > 0),
            transaction_date TEXT NOT NULL,
            payment_method TEXT NOT NULL DEFAULT 'cash',
            reference TEXT,
            notes TEXT,
            status TEXT NOT NULL DEFAULT 'active'
                CHECK (status IN ('active', 'voided')),
            created_by INTEGER,
            updated_by INTEGER,
            voided_by INTEGER,
            voided_at DATETIME,
            void_reason TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `);

    await run(`
        CREATE TABLE IF NOT EXISTS finance_other_income (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            business_id INTEGER NOT NULL,
            category TEXT NOT NULL,
            description TEXT NOT NULL,
            amount REAL NOT NULL CHECK (amount > 0),
            transaction_date TEXT NOT NULL,
            payment_method TEXT NOT NULL DEFAULT 'cash',
            reference TEXT,
            notes TEXT,
            status TEXT NOT NULL DEFAULT 'active'
                CHECK (status IN ('active', 'voided')),
            created_by INTEGER,
            updated_by INTEGER,
            voided_by INTEGER,
            voided_at DATETIME,
            void_reason TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `);

    await run(`
        CREATE INDEX IF NOT EXISTS idx_finance_expenses_business_date
        ON finance_expenses (business_id, transaction_date, status)
    `);

    await run(`
        CREATE INDEX IF NOT EXISTS idx_finance_expenses_category
        ON finance_expenses (business_id, category)
    `);

    await run(`
        CREATE INDEX IF NOT EXISTS idx_finance_income_business_date
        ON finance_other_income (business_id, transaction_date, status)
    `);

    await run(`
        CREATE INDEX IF NOT EXISTS idx_finance_income_category
        ON finance_other_income (business_id, category)
    `);

    console.log("Finance database migration: completed");
}

module.exports = migrateFinance;
