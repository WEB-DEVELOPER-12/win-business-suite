
require("dotenv").config();

const express = require("express");
const path = require("path");
const session = require("express-session");
const helmet = require("helmet");

const pool = require("./src/config/postgresDatabase");
const initializePostgresDatabase = require("./src/config/postgresInitDatabase");
const migrateLoginConfirmationCodes = require("./src/config/loginConfirmationCodeMigration");
const PostgresSessionStore = require("./src/services/postgresSessionStore");
const createCsrfProtection = require("./src/middleware/csrfProtection");

// Require a sufficiently strong session secret.
const sessionSecret = process.env.SESSION_SECRET;

if (
    typeof sessionSecret !== "string" ||
    sessionSecret.length < 32
) {
    throw new Error(
        "SESSION_SECRET must contain at least 32 characters."
    );
}

// Persistent PostgreSQL session storage.
const businessSessionStore = new PostgresSessionStore({
    pool,
    tableName: "win_sessions"
});

// Customer routes
const authRoutes = require("./src/routes/authRoutes");
const passwordResetRoutes = require("./src/routes/passwordResetRoutes");
const notificationRoutes = require("./src/routes/notificationRoutes");

const settingsRoutes = require("./src/routes/settingsRoutes");
const inventoryRoutes = require("./src/routes/inventoryRoutes");
const salesRoutes = require("./src/routes/salesRoutes");
const financeRoutes = require("./src/routes/financeRoutes");
const purchaseRoutes = require("./src/routes/purchaseRoutes");
const supplierRoutes = require("./src/routes/supplierRoutes");
const businessSettingsRoutes = require("./src/routes/businessSettingsRoutes");
const dataManagementRoutes = require("./src/routes/dataManagementRoutes");
const subscriptionRoutes = require("./src/routes/subscriptionRoutes");
const categoryRoutes = require("./src/routes/categoryRoutes");
const debtorRoutes = require("./src/routes/debtorRoutes");
const debtorNotebookRoutes = require("./src/routes/debtorNotebookRoutes");

// Admin routes and security
const adminAuthRoutes = require("./src/routes/adminAuthRoutes");
const adminOverviewRoutes = require("./src/routes/adminOverviewRoutes");
const adminCustomersRoutes = require("./src/routes/adminCustomersRoutes");
const adminSubscriptionsRoutes = require("./src/routes/adminSubscriptionsRoutes");
const adminNotificationsRoutes = require("./src/routes/adminNotificationsRoutes");
const adminMaintenanceRoutes = require("./src/routes/adminMaintenanceRoutes");

// Public maintenance status
const maintenanceStatusRoutes = require("./src/routes/maintenanceStatusRoutes");

// Middleware
const adminRateLimit = require("./src/middleware/adminRateLimit");
const requireAdminPageAuth = require("./src/middleware/requireAdminPageAuth");
const maintenanceGuard = require("./src/middleware/maintenanceGuard");

const emailRateLimit = require("./src/middleware/emailRateLimit");
const requireSubscription = require("./src/middleware/requireSubscription");
const businessAccessGuards = require("./src/middleware/businessAccessGuards");

const app = express();
const PORT = process.env.PORT || 3000;

app.disable("x-powered-by");

// HTTP security headers.
app.use(helmet({
    contentSecurityPolicy: false,
    strictTransportSecurity: false
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// CSRF origin protection.
app.use(createCsrfProtection());

// Persistent business-user sessions.
app.use(session({
    name: "win.sid",
    secret: sessionSecret,
    store: businessSessionStore,
    resave: false,
    saveUninitialized: false,
    cookie: {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        maxAge: 1000 * 60 * 60 * 8
    }
}));

// WIN ADMIN APIs
app.use("/api/admin/auth", adminRateLimit);
app.use("/api/admin/auth", adminAuthRoutes);

app.use("/api/admin/overview", adminOverviewRoutes);
app.use("/api/admin/customers", adminCustomersRoutes);
app.use("/api/admin/subscriptions", adminSubscriptionsRoutes);
app.use("/api/admin/notifications", adminNotificationsRoutes);
app.use("/api/admin/maintenance", adminMaintenanceRoutes);

// Protected admin dashboard.
app.use(
    "/admin",
    requireAdminPageAuth,
    express.static(path.join(__dirname, "public", "admin"), {
        index: false
    })
);

// Public maintenance status.
app.use("/api/maintenance", maintenanceStatusRoutes);

// Platform maintenance guard.
app.use(maintenanceGuard);

// General customer public files.
app.use(express.static(path.join(__dirname, "public")));

// CUSTOMER AUTHENTICATION
app.use("/api/auth", emailRateLimit);
app.use("/api/auth", businessAccessGuards);
app.use("/api/auth", authRoutes);
app.use("/api/auth", passwordResetRoutes);

app.use("/api/notifications", notificationRoutes);

// Customer settings and account management.
app.use("/api/settings", settingsRoutes);
app.use("/api/business-settings", businessSettingsRoutes);
app.use("/api/data-management", dataManagementRoutes);

// Customer subscriptions.
app.use("/api/subscription", subscriptionRoutes);

// CUSTOMER BUSINESS APIs
app.use("/api/inventory", requireSubscription);
app.use("/api/inventory", inventoryRoutes);

app.use("/api/sales", requireSubscription);
app.use("/api/sales", salesRoutes);

app.use("/api/finance", requireSubscription);
app.use("/api/finance", financeRoutes);

app.use("/api/purchases", requireSubscription);
app.use("/api/purchases", purchaseRoutes);

app.use("/api/suppliers", requireSubscription);
app.use("/api/suppliers", supplierRoutes);

app.use("/api/categories", requireSubscription);
app.use("/api/categories", categoryRoutes);

// Specific notebook routes before general debtor routes.
app.use("/api/debtors", requireSubscription);
app.use("/api/debtors", debtorNotebookRoutes);
app.use("/api/debtors", debtorRoutes);

// SERVER HEALTH
app.get("/api/health", (req, res) => {
    res.json({
        success: true,
        message: "WIN Business Suite server is running!",
        status: "healthy",
        database: "PostgreSQL",
        environment: process.env.NODE_ENV || "development"
    });
});

// SERVER STARTUP
async function startServer() {
    let server;

    try {
        // Create the login confirmation code tables.
        await migrateLoginConfirmationCodes();

        // Verify the PostgreSQL connection, schema and triggers.
        await initializePostgresDatabase();

        // Prepare persistent PostgreSQL session storage.
        await businessSessionStore.initialize();

        console.log("PostgreSQL database initialization: completed");
        console.log("Login confirmation code tables: enabled");
        console.log("Persistent PostgreSQL session storage: enabled");
        console.log("Helmet HTTP security headers: enabled");
        console.log("CSRF origin protection: enabled");

        // Process overdue maintenance schedules after restart.
        await adminMaintenanceRoutes.processDueMaintenance();

        server = app.listen(PORT, "0.0.0.0", () => {
            console.log("==================================");
            console.log("       WIN BUSINESS SUITE");
            console.log("==================================");

            console.log(`Server running on port ${PORT}`);
            console.log(`Environment: ${process.env.NODE_ENV || "development"}`);

            console.log("Database: PostgreSQL");
            console.log("Persistent business-user sessions: enabled");
            console.log("Session duration: 8 hours");

            console.log("Helmet HTTP security headers: enabled");
            console.log("CSRF origin protection: enabled");

            console.log("Admin authentication API: enabled");
            console.log("Admin login rate limiting: enabled");
            console.log("Admin page protection: enabled");
            console.log("Admin Overview API: enabled");
            console.log("Admin Customers API: enabled");
            console.log("Admin Subscriptions API: enabled");
            console.log("Admin Notifications API: enabled");
            console.log("Admin Maintenance API: enabled");

            console.log("Public maintenance status API: enabled");
            console.log("Platform maintenance guard: enabled");

            console.log("Scheduled notification processor: enabled");
            console.log("Scheduled maintenance processor: enabled");

            console.log("Business access guards: enabled");
            console.log("Customer authentication API: enabled");
            console.log("Customer notification API: enabled");

            console.log("Subscription routes: enabled");
            console.log("Password reset routes: enabled");

            const notificationScheduler = setInterval(() => {
                Promise.resolve(
                    adminNotificationsRoutes.processDueAnnouncements()
                ).catch(error => {
                    console.error("Scheduled notification processing failed:", error);
                });
            }, 15000);

            if (typeof notificationScheduler.unref === "function") {
                notificationScheduler.unref();
            }

            const maintenanceScheduler = setInterval(() => {
                Promise.resolve(
                    adminMaintenanceRoutes.processDueMaintenance()
                ).catch(error => {
                    console.error("Scheduled maintenance processing failed:", error);
                });
            }, 15000);

            if (typeof maintenanceScheduler.unref === "function") {
                maintenanceScheduler.unref();
            }
        });

        server.on("error", error => {
            console.error("WIN Business Suite server error:", error);
        });

        server.on("close", () => {
            businessSessionStore.close();

            pool.end().catch(error => {
                console.error("PostgreSQL pool shutdown failed:", error.message);
            });
        });

    } catch (error) {
        console.error("WIN Business Suite could not start.");
        console.error("PostgreSQL initialization failed:", error);

        try {
            await businessSessionStore.close();
        } catch (closeError) {
            console.error("Session store shutdown failed:", closeError.message);
        }

        try {
            await pool.end();
        } catch (closeError) {
            console.error("PostgreSQL pool shutdown failed:", closeError.message);
        }

        process.exitCode = 1;
    }
}

startServer();
