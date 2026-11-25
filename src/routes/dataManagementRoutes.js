
const express = require("express");
const fs = require("fs");
const path = require("path");

const router = express.Router();

const pool = require("../config/postgresDatabase");
const requireAuth = require("../middleware/requireAuth");

router.use(requireAuth);

const backupDirectory = path.join(
    process.cwd(),
    "private-data",
    "business-backups"
);

function requireBusinessOwner(req, res, next) {
    if (req.session.user.role !== "owner") {
        return res.status(403).json({
            success: false,
            message: "Only the business owner can perform this action."
        });
    }

    next();
}

function formatBytes(bytes) {
    if (bytes < 1024) return `${bytes} B`;

    const units = ["KB", "MB", "GB", "TB"];
    let size = bytes / 1024;
    let index = 0;

    while (size >= 1024 && index < units.length - 1) {
        size /= 1024;
        index++;
    }

    return `${size.toFixed(2)} ${units[index]}`;
}

async function getPostgresStorageInformation() {
    const result = await pool.query(`
        SELECT
            pg_database_size(current_database()) AS total_bytes,
            pg_size_pretty(
                pg_database_size(current_database())
            ) AS total_size
    `);

    const totalBytes = Number(result.rows[0].total_bytes);

    return {
        database: "PostgreSQL",
        totalBytes,
        totalSize: result.rows[0].total_size,
        files: []
    };
}

async function getBusinessData(businessId) {
    const client = await pool.connect();

    try {
        await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");

        const businessResult = await client.query(
            `SELECT
                id,
                business_name,
                business_type,
                email,
                phone,
                country,
                currency,
                address,
                registration_number,
                logo_url,
                created_at
             FROM businesses
             WHERE id = $1`,
            [businessId]
        );

        const business = businessResult.rows[0];

        if (!business) {
            throw new Error("Business not found.");
        }

        const queries = [
            [
                "users",
                `SELECT id, business_id, full_name, email, phone, role, created_at
                 FROM users WHERE business_id = $1`
            ],
            [
                "business_categories",
                "SELECT * FROM business_categories WHERE business_id = $1"
            ],
            [
                "products",
                "SELECT * FROM products WHERE business_id = $1"
            ],
            [
                "customers",
                "SELECT * FROM customers WHERE business_id = $1"
            ],
            [
                "suppliers",
                "SELECT * FROM suppliers WHERE business_id = $1"
            ],
            [
                "purchases",
                "SELECT * FROM purchases WHERE business_id = $1"
            ],
            [
                "purchase_items",
                `SELECT pi.*
                 FROM purchase_items pi
                 INNER JOIN purchases p ON p.id = pi.purchase_id
                 WHERE p.business_id = $1`
            ],
            [
                "supplier_payments",
                "SELECT * FROM supplier_payments WHERE business_id = $1"
            ],
            [
                "supplier_month_closures",
                "SELECT * FROM supplier_month_closures WHERE business_id = $1"
            ],
            [
                "stock_movements",
                "SELECT * FROM stock_movements WHERE business_id = $1"
            ],
            [
                "subscriptions",
                "SELECT * FROM subscriptions WHERE business_id = $1"
            ],
            [
                "subscription_payments",
                "SELECT * FROM subscription_payments WHERE business_id = $1"
            ],
            [
                "sales",
                "SELECT * FROM sales WHERE business_id = $1"
            ],
            [
                "sale_items",
                `SELECT si.*
                 FROM sale_items si
                 INNER JOIN sales s ON s.id = si.sale_id
                 WHERE s.business_id = $1`
            ],
            [
                "sale_payments",
                "SELECT * FROM sale_payments WHERE business_id = $1"
            ],
            [
                "debtor_transactions",
                "SELECT * FROM debtor_transactions WHERE business_id = $1"
            ],
            [
                "debtor_transaction_items",
                `SELECT dti.*
                 FROM debtor_transaction_items dti
                 INNER JOIN debtor_transactions dt
                    ON dt.id = dti.transaction_id
                 WHERE dt.business_id = $1`
            ],
            [
                "debtor_payments",
                "SELECT * FROM debtor_payments WHERE business_id = $1"
            ],
            [
                "debtor_payment_allocations",
                "SELECT * FROM debtor_payment_allocations WHERE business_id = $1"
            ],
            [
                "debtor_daily_notebooks",
                "SELECT * FROM debtor_daily_notebooks WHERE business_id = $1"
            ],
            [
                "debtor_monthly_notebooks",
                "SELECT * FROM debtor_monthly_notebooks WHERE business_id = $1"
            ],
            [
                "support_messages",
                "SELECT * FROM support_messages WHERE business_id = $1"
            ]
        ];

        const data = {};

        for (const [name, sql] of queries) {
            const result = await client.query(sql, [businessId]);
            data[name] = result.rows;
        }

        await client.query("COMMIT");

        return {
            format: "WIN Business Suite business data",
            formatVersion: 1,
            exportedAt: new Date().toISOString(),
            businessId,
            business,
            data
        };
    } catch (error) {
        await client.query("ROLLBACK").catch(() => {});
        throw error;
    } finally {
        client.release();
    }
}

// GET SERVER AND DATABASE CONNECTION STATUS.
router.get("/status", async (req, res) => {
    try {
        await pool.query("SELECT 1 AS connected");

        res.json({
            success: true,
            status: "connected",
            server: "online",
            database: "connected",
            databaseType: "PostgreSQL",
            checkedAt: new Date().toISOString()
        });
    } catch (error) {
        console.error("Data management status error:", error);

        res.status(503).json({
            success: false,
            status: "unavailable",
            server: "online",
            database: "unavailable",
            message: "The database connection could not be verified."
        });
    }
});

// GET POSTGRESQL DATABASE STORAGE INFORMATION.
router.get("/storage", async (req, res) => {
    try {
        const storage = await getPostgresStorageInformation();

        res.json({
            success: true,
            storage
        });
    } catch (error) {
        console.error("Storage information error:", error);

        res.status(500).json({
            success: false,
            message: "Could not read database storage information."
        });
    }
});

// EXPORT THE LOGGED-IN BUSINESS'S DATA.
router.get("/export", requireBusinessOwner, async (req, res) => {
    const businessId = req.session.user.business_id;

    try {
        const exportData = await getBusinessData(businessId);

        const filename =
            `win-business-data-${businessId}-${Date.now()}.json`;

        res.setHeader(
            "Content-Type",
            "application/json; charset=utf-8"
        );

        res.setHeader(
            "Content-Disposition",
            `attachment; filename="${filename}"`
        );

        res.json(exportData);
    } catch (error) {
        console.error("Business data export error:", error);

        res.status(500).json({
            success: false,
            message: "Could not export business data."
        });
    }
});

// CREATE A BUSINESS-SPECIFIC BACKUP.
router.post("/backups", requireBusinessOwner, async (req, res) => {
    const businessId = req.session.user.business_id;

    try {
        await fs.promises.mkdir(backupDirectory, {
            recursive: true
        });

        const backupData = await getBusinessData(businessId);

        const filename =
            `business-${businessId}-backup-${Date.now()}.json`;

        const backupPath = path.join(backupDirectory, filename);

        const backupJson = JSON.stringify(backupData, null, 2);

        await fs.promises.writeFile(
            backupPath,
            backupJson,
            {
                encoding: "utf8",
                flag: "wx",
                mode: 0o600
            }
        );

        res.status(201).json({
            success: true,
            message: "Business backup created successfully.",
            backup: {
                filename,
                createdAt: backupData.exportedAt,
                size: formatBytes(
                    Buffer.byteLength(backupJson, "utf8")
                )
            }
        });
    } catch (error) {
        console.error("Business backup creation error:", error);

        res.status(500).json({
            success: false,
            message: "Could not create a business backup."
        });
    }
});

// LIST ONLY THE LOGGED-IN BUSINESS'S BACKUPS.
router.get("/backups", requireBusinessOwner, async (req, res) => {
    const businessId = req.session.user.business_id;
    const prefix = `business-${businessId}-backup-`;

    try {
        await fs.promises.mkdir(backupDirectory, {
            recursive: true
        });

        const filenames = await fs.promises.readdir(backupDirectory);
        const backups = [];

        for (const filename of filenames) {
            if (
                !filename.startsWith(prefix) ||
                !filename.endsWith(".json")
            ) {
                continue;
            }

            const backupPath = path.join(backupDirectory, filename);
            const stats = await fs.promises.stat(backupPath);

            if (!stats.isFile()) continue;

            backups.push({
                filename,
                createdAt: stats.mtime.toISOString(),
                size: formatBytes(stats.size),
                sizeBytes: stats.size
            });
        }

        backups.sort((a, b) =>
            new Date(b.createdAt) - new Date(a.createdAt)
        );

        res.json({
            success: true,
            backups
        });
    } catch (error) {
        console.error("Business backup list error:", error);

        res.status(500).json({
            success: false,
            message: "Could not load business backups."
        });
    }
});

module.exports = router;
