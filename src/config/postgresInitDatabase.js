
const pool = require("./postgresDatabase");

const requiredTables = [
    "businesses",
    "users",
    "business_categories",
    "products",
    "customers",
    "suppliers",
    "purchases",
    "purchase_items",
    "supplier_payments",
    "supplier_month_closures",
    "subscriptions",
    "subscription_payments",
    "stock_movements",
    "debtor_transactions",
    "debtor_transaction_items",
    "debtor_payments",
    "debtor_daily_notebooks",
    "debtor_monthly_notebooks",
    "debtor_payment_allocations",
    "sales",
    "sale_items",
    "sale_payments",
    "support_messages",
    "admin_users",
    "admin_sessions",
    "admin_activity_logs",
    "admin_role_permissions",
    "admin_security_events",
    "email_delivery_logs",
    "email_request_limits",
    "email_security_events",
    "email_tokens",
    "finance_expenses",
    "finance_other_income",
    "maintenance_events",
    "platform_announcements",
    "platform_maintenance",
    "user_notifications",
    "win_sessions"
];

const requiredTriggers = [
    "trg_payment_status_notification",
    "trg_subscription_active_notification",
    "trg_subscription_expired_notification",
    "trg_subscription_request_notification",
    "trg_subscription_trial_notification",
    "trg_user_welcome_notification"
];

async function initializePostgresDatabase() {
    await pool.ready;

    const tablesResult = await pool.query(`
        SELECT table_name
        FROM information_schema.tables
        WHERE table_schema = 'public'
        AND table_type = 'BASE TABLE'
    `);

    const existingTables = new Set(
        tablesResult.rows.map(row => row.table_name)
    );

    const missingTables = requiredTables.filter(
        table => !existingTables.has(table)
    );

    if (missingTables.length > 0) {
        throw new Error(
            "PostgreSQL is missing required tables: " +
            missingTables.join(", ")
        );
    }

    const triggersResult = await pool.query(`
        SELECT t.tgname AS trigger_name
        FROM pg_trigger t
        JOIN pg_class c ON c.oid = t.tgrelid
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public'
        AND NOT t.tgisinternal
    `);

    const existingTriggers = new Set(
        triggersResult.rows.map(row => row.trigger_name)
    );

    const missingTriggers = requiredTriggers.filter(
        trigger => !existingTriggers.has(trigger)
    );

    if (missingTriggers.length > 0) {
        throw new Error(
            "PostgreSQL is missing required notification triggers: " +
            missingTriggers.join(", ")
        );
    }

    const sessionColumnsResult = await pool.query(`
        SELECT column_name
        FROM information_schema.columns
        WHERE table_schema = 'public'
        AND table_name = 'win_sessions'
    `);

    const sessionColumns = new Set(
        sessionColumnsResult.rows.map(row => row.column_name)
    );

    const requiredSessionColumns = [
        "sid",
        "sess",
        "expires_at"
    ];

    const missingSessionColumns = requiredSessionColumns.filter(
        column => !sessionColumns.has(column)
    );

    if (missingSessionColumns.length > 0) {
        throw new Error(
            "PostgreSQL win_sessions is missing columns: " +
            missingSessionColumns.join(", ")
        );
    }

    console.log(
        `PostgreSQL initialized: ${requiredTables.length} tables, ` +
        `${requiredTriggers.length} notification triggers, ` +
        "and session storage verified."
    );
}

module.exports = initializePostgresDatabase;
