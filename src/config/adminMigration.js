
const db = require("./database");

function run(sql, params = []) {
    return new Promise((resolve, reject) => {
        db.run(sql, params, function (error) {
            if (error) return reject(error);
            resolve(this);
        });
    });
}

const rolePermissions = {
    super_admin: [
        "dashboard.view",
        "customers.view",
        "customers.suspend",
        "customers.restore",
        "subscriptions.view",
        "subscriptions.activate",
        "subscriptions.renew",
        "payments.view",
        "payments.verify",
        "notifications.view",
        "notifications.manage",
        "maintenance.view",
        "maintenance.manage",
        "activity.view",
        "system_health.view",
        "system_health.manage",
        "administrators.manage"
    ],

    administrator: [
        "dashboard.view",
        "customers.view",
        "customers.suspend",
        "customers.restore",
        "subscriptions.view",
        "payments.view",
        "notifications.view",
        "maintenance.view",
        "activity.view",
        "system_health.view"
    ],

    finance_manager: [
        "dashboard.view",
        "customers.view",
        "subscriptions.view",
        "subscriptions.activate",
        "subscriptions.renew",
        "payments.view",
        "payments.verify",
        "activity.view"
    ],

    support_officer: [
        "dashboard.view",
        "customers.view",
        "subscriptions.view",
        "activity.view"
    ],

    notification_manager: [
        "dashboard.view",
        "notifications.view",
        "notifications.manage",
        "activity.view"
    ],

    system_operator: [
        "dashboard.view",
        "maintenance.view",
        "maintenance.manage",
        "system_health.view",
        "system_health.manage",
        "activity.view"
    ]
};

async function migrateAdminDatabase() {
    await run("BEGIN IMMEDIATE");

    try {
        await run(`
            CREATE TABLE IF NOT EXISTS admin_users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,

                full_name TEXT NOT NULL,
                email TEXT NOT NULL COLLATE NOCASE UNIQUE,
                password_hash TEXT NOT NULL,

                role TEXT NOT NULL DEFAULT 'administrator'
                    CHECK (
                        role IN (
                            'super_admin',
                            'administrator',
                            'finance_manager',
                            'support_officer',
                            'notification_manager',
                            'system_operator'
                        )
                    ),

                status TEXT NOT NULL DEFAULT 'active'
                    CHECK (
                        status IN ('active', 'suspended', 'disabled')
                    ),

                failed_login_attempts INTEGER NOT NULL DEFAULT 0
                    CHECK (failed_login_attempts >= 0),

                locked_until DATETIME,
                last_login_at DATETIME,
                last_login_ip TEXT,
                password_changed_at DATETIME,

                created_by INTEGER,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,

                FOREIGN KEY (created_by)
                    REFERENCES admin_users(id)
                    ON DELETE SET NULL
            )
        `);

        await run(`
            CREATE TABLE IF NOT EXISTS admin_sessions (
                session_id_hash TEXT PRIMARY KEY,

                admin_user_id INTEGER NOT NULL,

                expires_at DATETIME NOT NULL,
                last_seen_at DATETIME,
                revoked_at DATETIME,

                ip_address TEXT,
                user_agent TEXT,

                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,

                FOREIGN KEY (admin_user_id)
                    REFERENCES admin_users(id)
                    ON DELETE CASCADE
            )
        `);

        await run(`
            CREATE TABLE IF NOT EXISTS admin_role_permissions (
                role TEXT NOT NULL
                    CHECK (
                        role IN (
                            'super_admin',
                            'administrator',
                            'finance_manager',
                            'support_officer',
                            'notification_manager',
                            'system_operator'
                        )
                    ),

                permission TEXT NOT NULL,

                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,

                PRIMARY KEY (role, permission)
            )
        `);

        await run(`
            CREATE TABLE IF NOT EXISTS admin_activity_logs (
                id INTEGER PRIMARY KEY AUTOINCREMENT,

                admin_user_id INTEGER,

                action TEXT NOT NULL,
                target_type TEXT,
                target_id TEXT,
                details_json TEXT,

                ip_address TEXT,
                user_agent TEXT,

                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,

                FOREIGN KEY (admin_user_id)
                    REFERENCES admin_users(id)
                    ON DELETE SET NULL
            )
        `);

        await run(`
            CREATE TABLE IF NOT EXISTS admin_security_events (
                id INTEGER PRIMARY KEY AUTOINCREMENT,

                admin_user_id INTEGER,
                email TEXT,

                event_type TEXT NOT NULL,

                ip_address TEXT,
                user_agent TEXT,

                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,

                FOREIGN KEY (admin_user_id)
                    REFERENCES admin_users(id)
                    ON DELETE SET NULL
            )
        `);

        const indexes = [
            `CREATE INDEX IF NOT EXISTS idx_admin_users_status
             ON admin_users (status)`,

            `CREATE INDEX IF NOT EXISTS idx_admin_users_role
             ON admin_users (role)`,

            `CREATE INDEX IF NOT EXISTS idx_admin_sessions_admin
             ON admin_sessions (admin_user_id)`,

            `CREATE INDEX IF NOT EXISTS idx_admin_sessions_expiry
             ON admin_sessions (expires_at)`,

            `CREATE INDEX IF NOT EXISTS idx_admin_activity_admin_date
             ON admin_activity_logs (admin_user_id, created_at)`,

            `CREATE INDEX IF NOT EXISTS idx_admin_activity_date
             ON admin_activity_logs (created_at)`,

            `CREATE INDEX IF NOT EXISTS idx_admin_security_email
             ON admin_security_events (email, created_at)`,

            `CREATE INDEX IF NOT EXISTS idx_admin_security_date
             ON admin_security_events (created_at)`
        ];

        for (const sql of indexes) {
            await run(sql);
        }

        // Add the initial permission sets without overwriting
        // any permissions that may have been customized later.
        for (const [role, permissions] of Object.entries(rolePermissions)) {
            for (const permission of permissions) {
                await run(
                    `INSERT OR IGNORE INTO admin_role_permissions (
                        role,
                        permission
                    ) VALUES (?, ?)`,
                    [role, permission]
                );
            }
        }

        await run("COMMIT");

        console.log("WIN Admin database migration completed.");
        console.log("Administrator account table: enabled.");
        console.log("Administrator session tracking: enabled.");
        console.log("Six administrator roles: prepared.");
        console.log("Role permissions: prepared.");
        console.log("Admin activity logging: enabled.");
        console.log("Admin security event logging: enabled.");
        console.log("No default administrator account created.");

    } catch (error) {
        try {
            await run("ROLLBACK");
        } catch (rollbackError) {
            console.error(
                "Admin migration rollback failed:",
                rollbackError.message
            );
        }

        throw error;
    }
}

module.exports = migrateAdminDatabase;
