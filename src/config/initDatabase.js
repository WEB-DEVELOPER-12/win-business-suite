const db = require("./database");
const migrateSaleDebtSchema = require("./saleDebtMigration");

const tables = [
    `CREATE TABLE IF NOT EXISTS businesses (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        business_name TEXT NOT NULL,
        business_type TEXT NOT NULL,
        email TEXT,
        phone TEXT,
        country TEXT DEFAULT 'Kenya',
        currency TEXT DEFAULT 'KES',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`,

    `CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        business_id INTEGER NOT NULL,
        full_name TEXT NOT NULL,
        email TEXT NOT NULL UNIQUE,
        password_hash TEXT NOT NULL,
        role TEXT NOT NULL DEFAULT 'owner',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (business_id) REFERENCES businesses(id)
            ON DELETE CASCADE
    )`,

    `CREATE TABLE IF NOT EXISTS business_categories (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        business_id INTEGER NOT NULL,
        name TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (business_id) REFERENCES businesses(id)
            ON DELETE CASCADE
    )`,

    `CREATE TABLE IF NOT EXISTS products (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        business_id INTEGER NOT NULL,
        category_id INTEGER,
        product_name TEXT NOT NULL,
        description TEXT,
        selling_price REAL NOT NULL DEFAULT 0,
        buying_price REAL NOT NULL DEFAULT 0,
        stock_quantity REAL NOT NULL DEFAULT 0,
        low_stock_level REAL DEFAULT 5,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (business_id) REFERENCES businesses(id)
            ON DELETE CASCADE,
        FOREIGN KEY (category_id) REFERENCES business_categories(id)
            ON DELETE SET NULL
    )`,

    `CREATE TABLE IF NOT EXISTS customers (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        business_id INTEGER NOT NULL,
        full_name TEXT NOT NULL,
        phone TEXT,
        email TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (business_id) REFERENCES businesses(id)
            ON DELETE CASCADE
    )`,

    `CREATE TABLE IF NOT EXISTS suppliers (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        business_id INTEGER NOT NULL,
        supplier_name TEXT NOT NULL,
        phone TEXT,
        email TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (business_id) REFERENCES businesses(id)
            ON DELETE CASCADE
    )`,

    `CREATE TABLE IF NOT EXISTS purchases (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        business_id INTEGER NOT NULL,
        supplier_id INTEGER,
        purchase_number TEXT NOT NULL,
        total_amount REAL NOT NULL DEFAULT 0,
        purchase_date DATETIME DEFAULT CURRENT_TIMESTAMP,
        notes TEXT,
        created_by INTEGER,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (business_id) REFERENCES businesses(id)
            ON DELETE CASCADE,
        FOREIGN KEY (supplier_id) REFERENCES suppliers(id)
            ON DELETE SET NULL,
        FOREIGN KEY (created_by) REFERENCES users(id)
            ON DELETE SET NULL,
        UNIQUE (business_id, purchase_number)
    )`,

    `CREATE TABLE IF NOT EXISTS purchase_items (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        purchase_id INTEGER NOT NULL,
        product_id INTEGER,
        product_name TEXT NOT NULL,
        quantity REAL NOT NULL,
        unit_cost REAL NOT NULL,
        line_total REAL NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (purchase_id) REFERENCES purchases(id)
            ON DELETE CASCADE,
        FOREIGN KEY (product_id) REFERENCES products(id)
            ON DELETE SET NULL
    )`,

    `CREATE TABLE IF NOT EXISTS supplier_payments (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        business_id INTEGER NOT NULL,
        supplier_id INTEGER NOT NULL,
        payment_date TEXT NOT NULL,
        amount REAL NOT NULL CHECK (amount > 0),
        payment_method TEXT,
        reference TEXT,
        notes TEXT,
        created_by INTEGER,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (business_id) REFERENCES businesses(id)
            ON DELETE CASCADE,
        FOREIGN KEY (supplier_id) REFERENCES suppliers(id)
            ON DELETE CASCADE,
        FOREIGN KEY (created_by) REFERENCES users(id)
            ON DELETE SET NULL
    )`,

    `CREATE TABLE IF NOT EXISTS supplier_month_closures (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        business_id INTEGER NOT NULL,
        supplier_id INTEGER NOT NULL,
        year INTEGER NOT NULL,
        month INTEGER NOT NULL CHECK (month BETWEEN 1 AND 12),
        closed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        closed_by INTEGER,
        FOREIGN KEY (business_id) REFERENCES businesses(id)
            ON DELETE CASCADE,
        FOREIGN KEY (supplier_id) REFERENCES suppliers(id)
            ON DELETE CASCADE,
        FOREIGN KEY (closed_by) REFERENCES users(id)
            ON DELETE SET NULL,
        UNIQUE (business_id, supplier_id, year, month)
    )`,

    `CREATE TABLE IF NOT EXISTS subscriptions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        business_id INTEGER NOT NULL UNIQUE,
        plan_name TEXT NOT NULL DEFAULT 'WIN Pro',
        status TEXT NOT NULL DEFAULT 'pending',
        trial_started_at DATETIME,
        trial_ends_at DATETIME,
        current_period_start DATETIME,
        current_period_end DATETIME,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (business_id) REFERENCES businesses(id)
            ON DELETE CASCADE
    )`,

    `CREATE TABLE IF NOT EXISTS subscription_payments (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        business_id INTEGER NOT NULL,
        user_id INTEGER NOT NULL,
        plan_name TEXT NOT NULL DEFAULT 'WIN Pro',
        billing_cycle TEXT NOT NULL,
        amount REAL NOT NULL,
        currency TEXT NOT NULL DEFAULT 'KES',
        transaction_reference TEXT,
        status TEXT NOT NULL DEFAULT 'pending',
        submitted_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        verified_at DATETIME,
        verified_by INTEGER,
        notes TEXT,
        FOREIGN KEY (business_id) REFERENCES businesses(id)
            ON DELETE CASCADE,
        FOREIGN KEY (user_id) REFERENCES users(id)
            ON DELETE CASCADE,
        FOREIGN KEY (verified_by) REFERENCES users(id)
            ON DELETE SET NULL
    )`,

    `CREATE TABLE IF NOT EXISTS stock_movements (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        business_id INTEGER NOT NULL,
        product_id INTEGER,
        movement_type TEXT NOT NULL CHECK (
            movement_type IN (
                'opening_stock',
                'stock_in',
                'stock_out',
                'adjustment',
                'credit_sale',
                'purchase'
            )
        ),
        quantity_before REAL NOT NULL,
        quantity_changed REAL NOT NULL,
        quantity_after REAL NOT NULL,
        reason TEXT,
        reference_type TEXT,
        reference_id INTEGER,
        created_by INTEGER,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (business_id) REFERENCES businesses(id)
            ON DELETE CASCADE,
        FOREIGN KEY (product_id) REFERENCES products(id)
            ON DELETE SET NULL,
        FOREIGN KEY (created_by) REFERENCES users(id)
            ON DELETE SET NULL
    )`,

    `CREATE TABLE IF NOT EXISTS debtor_transactions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        business_id INTEGER NOT NULL,
        customer_id INTEGER NOT NULL,
        transaction_number TEXT NOT NULL,
        transaction_date TEXT NOT NULL,
        total_amount REAL NOT NULL CHECK (total_amount > 0),
        notes TEXT,
        created_by INTEGER,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (business_id) REFERENCES businesses(id)
            ON DELETE CASCADE,
        FOREIGN KEY (customer_id) REFERENCES customers(id)
            ON DELETE CASCADE,
        FOREIGN KEY (created_by) REFERENCES users(id)
            ON DELETE SET NULL,
        UNIQUE (business_id, transaction_number)
    )`,

    `CREATE TABLE IF NOT EXISTS debtor_transaction_items (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        transaction_id INTEGER NOT NULL,
        product_id INTEGER,
        product_name TEXT NOT NULL,
        quantity REAL NOT NULL CHECK (quantity > 0),
        unit_price REAL NOT NULL CHECK (unit_price >= 0),
        line_total REAL NOT NULL CHECK (line_total >= 0),
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (transaction_id)
            REFERENCES debtor_transactions(id)
            ON DELETE CASCADE,
        FOREIGN KEY (product_id)
            REFERENCES products(id)
            ON DELETE SET NULL
    )`,

    `CREATE TABLE IF NOT EXISTS debtor_payments (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        business_id INTEGER NOT NULL,
        customer_id INTEGER NOT NULL,
        payment_date TEXT NOT NULL,
        amount REAL NOT NULL CHECK (amount > 0),
        payment_method TEXT,
        reference TEXT,
        notes TEXT,
        created_by INTEGER,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (business_id) REFERENCES businesses(id)
            ON DELETE CASCADE,
        FOREIGN KEY (customer_id) REFERENCES customers(id)
            ON DELETE CASCADE,
        FOREIGN KEY (created_by) REFERENCES users(id)
            ON DELETE SET NULL
    )`,

    `CREATE TABLE IF NOT EXISTS debtor_daily_notebooks (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        business_id INTEGER NOT NULL,
        customer_id INTEGER NOT NULL,
        notebook_date TEXT NOT NULL,
        opening_balance REAL NOT NULL DEFAULT 0,
        debt_added REAL NOT NULL DEFAULT 0,
        payments_received REAL NOT NULL DEFAULT 0,
        closing_balance REAL NOT NULL DEFAULT 0,
        status TEXT NOT NULL DEFAULT 'open'
            CHECK (status IN ('open', 'closed')),
        closed_at DATETIME,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (business_id) REFERENCES businesses(id)
            ON DELETE CASCADE,
        FOREIGN KEY (customer_id) REFERENCES customers(id)
            ON DELETE CASCADE,
        UNIQUE (business_id, customer_id, notebook_date)
    )`,

    `CREATE TABLE IF NOT EXISTS debtor_monthly_notebooks (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        business_id INTEGER NOT NULL,
        customer_id INTEGER NOT NULL,
        year INTEGER NOT NULL,
        month INTEGER NOT NULL CHECK (month BETWEEN 1 AND 12),
        opening_balance REAL NOT NULL DEFAULT 0,
        debt_added REAL NOT NULL DEFAULT 0,
        payments_received REAL NOT NULL DEFAULT 0,
        closing_balance REAL NOT NULL DEFAULT 0,
        status TEXT NOT NULL DEFAULT 'open'
            CHECK (status IN ('open', 'closed')),
        closed_at DATETIME,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (business_id) REFERENCES businesses(id)
            ON DELETE CASCADE,
        FOREIGN KEY (customer_id) REFERENCES customers(id)
            ON DELETE CASCADE,
        UNIQUE (business_id, customer_id, year, month)
    )`,

    `CREATE TABLE IF NOT EXISTS sales (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        business_id INTEGER NOT NULL,
        customer_id INTEGER,
        sale_number TEXT NOT NULL,
        sale_date TEXT NOT NULL,
        subtotal REAL NOT NULL CHECK (subtotal >= 0),
        discount_amount REAL NOT NULL DEFAULT 0
            CHECK (discount_amount >= 0),
        total_amount REAL NOT NULL CHECK (total_amount >= 0),
        amount_paid REAL NOT NULL DEFAULT 0 CHECK (amount_paid >= 0),
        balance_due REAL NOT NULL DEFAULT 0 CHECK (balance_due >= 0),
        payment_status TEXT NOT NULL DEFAULT 'paid'
            CHECK (payment_status IN ('paid', 'partially_paid', 'unpaid')),
        status TEXT NOT NULL DEFAULT 'completed'
            CHECK (status IN ('completed', 'voided')),
        notes TEXT,
        created_by INTEGER,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (business_id) REFERENCES businesses(id)
            ON DELETE CASCADE,
        FOREIGN KEY (customer_id) REFERENCES customers(id)
            ON DELETE SET NULL,
        FOREIGN KEY (created_by) REFERENCES users(id)
            ON DELETE SET NULL,
        UNIQUE (business_id, sale_number)
    )`,

    `CREATE TABLE IF NOT EXISTS sale_items (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        sale_id INTEGER NOT NULL,
        product_id INTEGER,
        product_name TEXT NOT NULL,
        quantity REAL NOT NULL CHECK (quantity > 0),
        unit_price REAL NOT NULL CHECK (unit_price >= 0),
        unit_cost REAL NOT NULL DEFAULT 0 CHECK (unit_cost >= 0),
        line_subtotal REAL NOT NULL CHECK (line_subtotal >= 0),
        discount_amount REAL NOT NULL DEFAULT 0
            CHECK (discount_amount >= 0),
        line_total REAL NOT NULL CHECK (line_total >= 0),
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (sale_id) REFERENCES sales(id)
            ON DELETE CASCADE,
        FOREIGN KEY (product_id) REFERENCES products(id)
            ON DELETE SET NULL
    )`,

    `CREATE TABLE IF NOT EXISTS sale_payments (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        business_id INTEGER NOT NULL,
        sale_id INTEGER NOT NULL,
        payment_date TEXT NOT NULL,
        amount REAL NOT NULL CHECK (amount > 0),
        payment_method TEXT NOT NULL,
        reference TEXT,
        notes TEXT,
        created_by INTEGER,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (business_id) REFERENCES businesses(id)
            ON DELETE CASCADE,
        FOREIGN KEY (sale_id) REFERENCES sales(id)
            ON DELETE CASCADE,
        FOREIGN KEY (created_by) REFERENCES users(id)
            ON DELETE SET NULL
    )`,

    `CREATE TABLE IF NOT EXISTS support_messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        business_id INTEGER NOT NULL,
        user_id INTEGER NOT NULL,
        subject TEXT NOT NULL,
        message TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'open',
        admin_response TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (business_id) REFERENCES businesses(id)
            ON DELETE CASCADE,
        FOREIGN KEY (user_id) REFERENCES users(id)
            ON DELETE CASCADE
    )`
];

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

async function createTables() {
    for (const sql of tables) {
        await run(sql);
    }
}

async function upgradeTableColumns(tableName, upgrades, label) {
    const columns = await all(`PRAGMA table_info(${tableName})`);
    const existing = columns.map(column => column.name);

    for (const upgrade of upgrades) {
        if (existing.includes(upgrade.name)) continue;

        await run(upgrade.sql);
        console.log(`${label} column added: ${upgrade.name}`);
    }

    console.log(`${label} database upgrade completed.`);
}

async function upgradeCategoryTable() {
    await upgradeTableColumns("business_categories", [
        {
            name: "description",
            sql: "ALTER TABLE business_categories ADD COLUMN description TEXT"
        },
        {
            name: "icon",
            sql: "ALTER TABLE business_categories ADD COLUMN icon TEXT"
        },
        {
            name: "parent_id",
            sql: `ALTER TABLE business_categories
                ADD COLUMN parent_id INTEGER
                REFERENCES business_categories(id)
                ON DELETE RESTRICT`
        },
        {
            name: "category_type",
            sql: `ALTER TABLE business_categories
                ADD COLUMN category_type TEXT NOT NULL DEFAULT 'custom'`
        }
    ], "Category");
}

async function upgradeSupplierTable() {
    await upgradeTableColumns("suppliers", [
        {
            name: "notes",
            sql: "ALTER TABLE suppliers ADD COLUMN notes TEXT"
        }
    ], "Supplier");
}

async function upgradeCustomerTable() {
    await upgradeTableColumns("customers", [
        {
            name: "address",
            sql: "ALTER TABLE customers ADD COLUMN address TEXT"
        },
        {
            name: "notes",
            sql: "ALTER TABLE customers ADD COLUMN notes TEXT"
        },
        {
            name: "credit_limit",
            sql: "ALTER TABLE customers ADD COLUMN credit_limit REAL NOT NULL DEFAULT 0"
        },
        {
            name: "credit_enabled",
            sql: "ALTER TABLE customers ADD COLUMN credit_enabled INTEGER NOT NULL DEFAULT 1"
        }
    ], "Customer / Debtor");
}

async function migrateSubscriptions() {
    const columns = await all("PRAGMA table_info(subscriptions)");

    const startedColumn = columns.find(
        column => column.name === "trial_started_at"
    );
    const endsColumn = columns.find(
        column => column.name === "trial_ends_at"
    );

    if (!startedColumn || !endsColumn) return;

    if (startedColumn.notnull === 0 && endsColumn.notnull === 0) {
        return;
    }

    await run("BEGIN IMMEDIATE");

    try {
        await run(`
            CREATE TABLE subscriptions_new (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                business_id INTEGER NOT NULL UNIQUE,
                plan_name TEXT NOT NULL DEFAULT 'WIN Pro',
                status TEXT NOT NULL DEFAULT 'pending',
                trial_started_at DATETIME,
                trial_ends_at DATETIME,
                current_period_start DATETIME,
                current_period_end DATETIME,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (business_id) REFERENCES businesses(id)
                    ON DELETE CASCADE
            )
        `);

        await run(`
            INSERT INTO subscriptions_new (
                id, business_id, plan_name, status,
                trial_started_at, trial_ends_at,
                current_period_start, current_period_end,
                created_at, updated_at
            )
            SELECT
                id, business_id, plan_name, status,
                trial_started_at, trial_ends_at,
                current_period_start, current_period_end,
                created_at, updated_at
            FROM subscriptions
        `);

        await run("DROP TABLE subscriptions");
        await run("ALTER TABLE subscriptions_new RENAME TO subscriptions");
        await run("COMMIT");

        console.log("Subscription database migration completed.");
    } catch (error) {
        try {
            await run("ROLLBACK");
        } catch (rollbackError) {
            console.error("Subscription rollback failed:", rollbackError.message);
        }

        throw error;
    }
}

async function createIndexes() {
    const indexes = [
        `CREATE INDEX IF NOT EXISTS idx_supplier_payments_lookup
         ON supplier_payments (business_id, supplier_id, payment_date)`,

        `CREATE INDEX IF NOT EXISTS idx_supplier_closures_lookup
         ON supplier_month_closures (business_id, supplier_id, year, month)`,

        `CREATE INDEX IF NOT EXISTS idx_purchases_supplier_date
         ON purchases (business_id, supplier_id, purchase_date)`,

        `CREATE INDEX IF NOT EXISTS idx_purchase_items_product
         ON purchase_items (product_id)`,

        `CREATE INDEX IF NOT EXISTS idx_debtor_transactions_customer_date
         ON debtor_transactions (business_id, customer_id, transaction_date)`,

        `CREATE INDEX IF NOT EXISTS idx_debtor_transactions_date
         ON debtor_transactions (business_id, transaction_date)`,

        `CREATE INDEX IF NOT EXISTS idx_debtor_items_transaction
         ON debtor_transaction_items (transaction_id)`,

        `CREATE INDEX IF NOT EXISTS idx_debtor_items_product
         ON debtor_transaction_items (product_id)`,

        `CREATE INDEX IF NOT EXISTS idx_debtor_payments_customer_date
         ON debtor_payments (business_id, customer_id, payment_date)`,

        `CREATE INDEX IF NOT EXISTS idx_debtor_daily_lookup
         ON debtor_daily_notebooks (business_id, customer_id, notebook_date)`,

        `CREATE INDEX IF NOT EXISTS idx_debtor_monthly_lookup
         ON debtor_monthly_notebooks (business_id, customer_id, year, month)`,

        `CREATE INDEX IF NOT EXISTS idx_stock_movements_business_product
         ON stock_movements (business_id, product_id)`,

        `CREATE INDEX IF NOT EXISTS idx_stock_movements_date
         ON stock_movements (business_id, created_at)`,

        `CREATE INDEX IF NOT EXISTS idx_sales_business_date
         ON sales (business_id, sale_date)`,

        `CREATE INDEX IF NOT EXISTS idx_sales_customer_date
         ON sales (business_id, customer_id, sale_date)`,

        `CREATE INDEX IF NOT EXISTS idx_sale_items_sale
         ON sale_items (sale_id)`,

        `CREATE INDEX IF NOT EXISTS idx_sale_items_product
         ON sale_items (product_id)`,

        `CREATE INDEX IF NOT EXISTS idx_sale_payments_sale_date
         ON sale_payments (sale_id, payment_date)`,

        `CREATE INDEX IF NOT EXISTS idx_sale_payments_business_date
         ON sale_payments (business_id, payment_date)`
    ];

    for (const sql of indexes) {
        await run(sql);
    }
}

async function initializeDatabase() {
    await createTables();

    await migrateSubscriptions();

    await upgradeCategoryTable();
    await upgradeSupplierTable();
    await upgradeCustomerTable();

    await createIndexes();

    await migrateSaleDebtSchema();

    console.log("WIN Business Suite database is ready.");
}

// Other parts of the application can await this promise before using the DB.
db.ready = initializeDatabase();

db.ready.catch(error => {
    console.error("WIN Business Suite database initialization failed:", error);
});

module.exports = db;