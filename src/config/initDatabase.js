
const db = require("./database");

const tables = [

    // Businesses
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

    // Users
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

    // Business categories
    `CREATE TABLE IF NOT EXISTS business_categories (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        business_id INTEGER NOT NULL,
        name TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (business_id) REFERENCES businesses(id)
            ON DELETE CASCADE
    )`,

    // Products
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

    // Customers / Debtor profiles
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

    // Suppliers - preserved for future Supplier Management
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

    // Purchases
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

    // Purchase items
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

    // Supplier payments
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

    // Permanently closed supplier months
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

    // Business subscriptions
    `CREATE TABLE IF NOT EXISTS subscriptions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        business_id INTEGER NOT NULL UNIQUE,
        plan_name TEXT NOT NULL DEFAULT 'WIN Pro',
        status TEXT NOT NULL DEFAULT 'trial',
        trial_started_at DATETIME NOT NULL,
        trial_ends_at DATETIME NOT NULL,
        current_period_start DATETIME,
        current_period_end DATETIME,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (business_id) REFERENCES businesses(id)
            ON DELETE CASCADE
    )`,

    // Subscription payment requests
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

    // ==========================================
    // DEBTOR MANAGEMENT TABLES
    // ==========================================

    // Credit transactions
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

    // Individual products taken on credit
    // Product name and price are historical snapshots.
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

    // Debtor payments
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

    // Individual debtor daily notebooks
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

    // Individual debtor monthly notebooks
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

    // ==========================================
    // END DEBTOR MANAGEMENT TABLES
    // ==========================================
];

// Safely add missing columns to existing tables.
function upgradeTableColumns(tableName, upgrades, label) {
    db.all(`PRAGMA table_info(${tableName})`, (error, columns) => {
        if (error) {
            console.error(`${label} inspection failed:`, error.message);
            return;
        }

        const existingColumns = columns.map(column => column.name);

        const missingUpgrades = upgrades.filter(
            upgrade => !existingColumns.includes(upgrade.name)
        );

        function applyNextUpgrade(index) {
            if (index >= missingUpgrades.length) {
                console.log(`${label} database upgrade completed.`);
                return;
            }

            const upgrade = missingUpgrades[index];

            db.run(upgrade.sql, error => {
                if (error) {
                    console.error(
                        `${label} upgrade failed (${upgrade.name}):`,
                        error.message
                    );
                    return;
                }

                console.log(`${label} column added: ${upgrade.name}`);
                applyNextUpgrade(index + 1);
            });
        }

        applyNextUpgrade(0);
    });
}

// Upgrade existing category tables safely.
function upgradeCategoryTable() {
    upgradeTableColumns(
        "business_categories",
        [
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
        ],
        "Category"
    );
}

// Upgrade existing supplier table safely.
function upgradeSupplierTable() {
    upgradeTableColumns(
        "suppliers",
        [
            {
                name: "notes",
                sql: "ALTER TABLE suppliers ADD COLUMN notes TEXT"
            }
        ],
        "Supplier"
    );
}

// Upgrade existing customer profiles for Debtor Management.
function upgradeCustomerTable() {
    upgradeTableColumns(
        "customers",
        [
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
        ],
        "Customer / Debtor"
    );
}

// Create indexes for supplier records.
function createSupplierIndexes() {
    const indexes = [
        `CREATE INDEX IF NOT EXISTS idx_supplier_payments_lookup
         ON supplier_payments (business_id, supplier_id, payment_date)`,

        `CREATE INDEX IF NOT EXISTS idx_supplier_closures_lookup
         ON supplier_month_closures (business_id, supplier_id, year, month)`,

        `CREATE INDEX IF NOT EXISTS idx_purchases_supplier_date
         ON purchases (business_id, supplier_id, purchase_date)`,

        `CREATE INDEX IF NOT EXISTS idx_purchase_items_product
         ON purchase_items (product_id)`
    ];

    indexes.forEach(sql => {
        db.run(sql, error => {
            if (error) {
                console.error("Supplier index creation failed:", error.message);
            }
        });
    });
}

// Create indexes for Debtor Management.
function createDebtorIndexes() {
    const indexes = [
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
         ON debtor_monthly_notebooks (business_id, customer_id, year, month)`
    ];

    indexes.forEach(sql => {
        db.run(sql, error => {
            if (error) {
                console.error("Debtor index creation failed:", error.message);
            }
        });
    });
}

// Initialize database.
db.serialize(() => {
    tables.forEach(sql => {
        db.run(sql, error => {
            if (error) {
                console.error("Database table error:", error.message);
            }
        });
    });

    upgradeCategoryTable();
    upgradeSupplierTable();
    upgradeCustomerTable();

    createSupplierIndexes();
    createDebtorIndexes();
});

module.exports = db;
