
const express = require("express");
const pool = require("../config/postgresDatabase");
const requireAuth = require("../middleware/requireAuth");

const router = express.Router();

router.use(requireAuth);

function validId(value) {
    const id = Number(value);
    return Number.isInteger(id) && id > 0 ? id : null;
}

function validDate(value) {
    if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
        return false;
    }

    const date = new Date(`${value}T00:00:00Z`);
    return !Number.isNaN(date.getTime()) &&
        date.toISOString().slice(0, 10) === value;
}

function validMonth(year, month) {
    return Number.isInteger(year) &&
        year >= 2000 &&
        Number.isInteger(month) &&
        month >= 1 &&
        month <= 12;
}

async function getSupplier(client, businessId, supplierId, lock = false) {
    const result = await client.query(
        `SELECT *
         FROM suppliers
         WHERE id = $1 AND business_id = $2
         ${lock ? "FOR UPDATE" : ""}`,
        [supplierId, businessId]
    );

    return result.rows[0] || null;
}

async function checkClosedMonth(client, businessId, supplierId, date) {
    const year = Number(date.slice(0, 4));
    const month = Number(date.slice(5, 7));

    const result = await client.query(
        `SELECT id
         FROM supplier_month_closures
         WHERE business_id = $1
           AND supplier_id = $2
           AND year = $3
           AND month = $4`,
        [businessId, supplierId, year, month]
    );

    return result.rows.length > 0;
}

function monthDateRange(year, month) {
    const startDate = `${year}-${String(month).padStart(2, "0")}-01`;
    const endDate = new Date(Date.UTC(year, month, 1))
        .toISOString()
        .slice(0, 10);

    return { startDate, endDate };
}

// GET ALL SUPPLIERS
router.get("/", async (req, res) => {
    const businessId = req.session.user.business_id;

    try {
        const result = await pool.query(
            `SELECT id, supplier_name, phone, email, notes, created_at
             FROM suppliers
             WHERE business_id = $1
             ORDER BY created_at DESC`,
            [businessId]
        );

        return res.json({
            success: true,
            suppliers: result.rows
        });
    } catch (error) {
        console.error("Get suppliers error:", error.message);

        return res.status(500).json({
            success: false,
            message: "Could not load suppliers."
        });
    }
});

// ADD SUPPLIER
router.post("/", async (req, res) => {
    const businessId = req.session.user.business_id;
    const supplierName = String(req.body.supplier_name || "").trim();
    const phone = String(req.body.phone || "").trim();
    const email = String(req.body.email || "").trim();
    const notes = String(req.body.notes || "").trim();

    if (!supplierName) {
        return res.status(400).json({
            success: false,
            message: "Supplier name is required."
        });
    }

    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return res.status(400).json({
            success: false,
            message: "Please enter a valid email address."
        });
    }

    try {
        const result = await pool.query(
            `INSERT INTO suppliers
                (business_id, supplier_name, phone, email, notes)
             VALUES ($1, $2, $3, $4, $5)
             RETURNING id`,
            [
                businessId,
                supplierName,
                phone || null,
                email || null,
                notes || null
            ]
        );

        return res.status(201).json({
            success: true,
            message: "Supplier added successfully.",
            supplierId: result.rows[0].id
        });
    } catch (error) {
        console.error("Add supplier error:", error.message);

        return res.status(500).json({
            success: false,
            message: "Could not add supplier."
        });
    }
});

// UPDATE SUPPLIER
router.put("/:id", async (req, res) => {
    const businessId = req.session.user.business_id;
    const supplierId = validId(req.params.id);
    const supplierName = String(req.body.supplier_name || "").trim();
    const phone = String(req.body.phone || "").trim();
    const email = String(req.body.email || "").trim();
    const notes = String(req.body.notes || "").trim();

    if (!supplierId || !supplierName) {
        return res.status(400).json({
            success: false,
            message: "Valid supplier ID and supplier name are required."
        });
    }

    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return res.status(400).json({
            success: false,
            message: "Please enter a valid email address."
        });
    }

    try {
        const result = await pool.query(
            `UPDATE suppliers
             SET supplier_name = $1,
                 phone = $2,
                 email = $3,
                 notes = $4
             WHERE id = $5 AND business_id = $6
             RETURNING id`,
            [
                supplierName,
                phone || null,
                email || null,
                notes || null,
                supplierId,
                businessId
            ]
        );

        if (result.rowCount === 0) {
            return res.status(404).json({
                success: false,
                message: "Supplier not found."
            });
        }

        return res.json({
            success: true,
            message: "Supplier updated successfully."
        });
    } catch (error) {
        console.error("Update supplier error:", error.message);

        return res.status(500).json({
            success: false,
            message: "Could not update supplier."
        });
    }
});

// DELETE SUPPLIER — PROTECT FINANCIAL HISTORY
router.delete("/:id", async (req, res) => {
    const businessId = req.session.user.business_id;
    const supplierId = validId(req.params.id);

    if (!supplierId) {
        return res.status(400).json({
            success: false,
            message: "Invalid supplier ID."
        });
    }

    const client = await pool.connect();

    try {
        await client.query("BEGIN");

        const supplier = await getSupplier(
            client, businessId, supplierId, true
        );

        if (!supplier) {
            await client.query("ROLLBACK");

            return res.status(404).json({
                success: false,
                message: "Supplier not found."
            });
        }

        const historyResult = await client.query(
            `SELECT
                (SELECT COUNT(*) FROM purchases
                 WHERE business_id = $1 AND supplier_id = $2) +
                (SELECT COUNT(*) FROM supplier_payments
                 WHERE business_id = $1 AND supplier_id = $2) +
                (SELECT COUNT(*) FROM supplier_month_closures
                 WHERE business_id = $1 AND supplier_id = $2)
                AS history_count`,
            [businessId, supplierId]
        );

        if (Number(historyResult.rows[0].history_count) > 0) {
            await client.query("ROLLBACK");

            return res.status(409).json({
                success: false,
                message: "This supplier has financial history and cannot be deleted."
            });
        }

        await client.query(
            `DELETE FROM suppliers
             WHERE id = $1 AND business_id = $2`,
            [supplierId, businessId]
        );

        await client.query("COMMIT");

        return res.json({
            success: true,
            message: "Supplier deleted successfully."
        });
    } catch (error) {
        await client.query("ROLLBACK").catch(() => {});

        console.error("Delete supplier error:", error.message);

        return res.status(500).json({
            success: false,
            message: "Could not delete supplier."
        });
    } finally {
        client.release();
    }
});

// SUPPLIER ACCOUNT OVERVIEW
router.get("/:id/overview", async (req, res) => {
    const businessId = req.session.user.business_id;
    const supplierId = validId(req.params.id);

    if (!supplierId) {
        return res.status(400).json({
            success: false,
            message: "Invalid supplier ID."
        });
    }

    try {
        const supplier = await getSupplier(
            pool, businessId, supplierId
        );

        if (!supplier) {
            return res.status(404).json({
                success: false,
                message: "Supplier not found."
            });
        }

        const result = await pool.query(
            `SELECT
                COALESCE((SELECT SUM(total_amount)
                    FROM purchases
                    WHERE business_id = $1 AND supplier_id = $2), 0)
                    AS total_purchases,

                COALESCE((SELECT SUM(amount)
                    FROM supplier_payments
                    WHERE business_id = $1 AND supplier_id = $2), 0)
                    AS total_payments,

                (SELECT COUNT(*) FROM purchases
                    WHERE business_id = $1 AND supplier_id = $2)
                    AS purchase_count,

                (SELECT COUNT(*) FROM supplier_payments
                    WHERE business_id = $1 AND supplier_id = $2)
                    AS payment_count`,
            [businessId, supplierId]
        );

        const summary = result.rows[0];
        const purchases = Number(summary.total_purchases);
        const payments = Number(summary.total_payments);

        return res.json({
            success: true,
            supplier,
            account: {
                total_purchases: purchases,
                total_payments: payments,
                outstanding_balance: Math.max(purchases - payments, 0),
                supplier_credit: Math.max(payments - purchases, 0),
                purchase_count: Number(summary.purchase_count),
                payment_count: Number(summary.payment_count)
            }
        });
    } catch (error) {
        console.error("Supplier account overview error:", error.message);

        return res.status(500).json({
            success: false,
            message: "Could not calculate supplier account."
        });
    }
});

// RECORD SUPPLIER PAYMENT
router.post("/:id/payments", async (req, res) => {
    const businessId = req.session.user.business_id;
    const supplierId = validId(req.params.id);
    const paymentDate = String(req.body.payment_date || "");
    const amount = Number(req.body.amount);
    const method = String(req.body.payment_method || "").trim();
    const reference = String(req.body.reference || "").trim();
    const notes = String(req.body.notes || "").trim();

    if (!supplierId || !validDate(paymentDate) ||
        !Number.isFinite(amount) || amount <= 0) {
        return res.status(400).json({
            success: false,
            message: "Enter a valid supplier, payment date and positive amount."
        });
    }

    const client = await pool.connect();

    try {
        await client.query("BEGIN");

        const supplier = await getSupplier(
            client, businessId, supplierId, true
        );

        if (!supplier) {
            await client.query("ROLLBACK");

            return res.status(404).json({
                success: false,
                message: "Supplier not found."
            });
        }

        const closed = await checkClosedMonth(
            client, businessId, supplierId, paymentDate
        );

        if (closed) {
            await client.query("ROLLBACK");

            return res.status(409).json({
                success: false,
                message: "This supplier's month is closed. Payments cannot be added."
            });
        }

        const result = await client.query(
            `INSERT INTO supplier_payments
                (business_id, supplier_id, payment_date, amount,
                 payment_method, reference, notes, created_by)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
             RETURNING id`,
            [
                businessId,
                supplierId,
                paymentDate,
                amount,
                method || null,
                reference || null,
                notes || null,
                req.session.user.id
            ]
        );

        await client.query("COMMIT");

        return res.status(201).json({
            success: true,
            message: "Supplier payment recorded successfully.",
            paymentId: result.rows[0].id
        });
    } catch (error) {
        await client.query("ROLLBACK").catch(() => {});

        console.error("Supplier payment error:", error.message);

        return res.status(500).json({
            success: false,
            message: "Could not record supplier payment."
        });
    } finally {
        client.release();
    }
});

// SUPPLIER PAYMENT HISTORY
router.get("/:id/payments", async (req, res) => {
    const businessId = req.session.user.business_id;
    const supplierId = validId(req.params.id);

    if (!supplierId) {
        return res.status(400).json({
            success: false,
            message: "Invalid supplier ID."
        });
    }

    try {
        const supplier = await getSupplier(
            pool, businessId, supplierId
        );

        if (!supplier) {
            return res.status(404).json({
                success: false,
                message: "Supplier not found."
            });
        }

        const result = await pool.query(
            `SELECT id, payment_date, amount, payment_method,
                    reference, notes, created_at
             FROM supplier_payments
             WHERE business_id = $1 AND supplier_id = $2
             ORDER BY payment_date DESC, id DESC`,
            [businessId, supplierId]
        );

        return res.json({
            success: true,
            payments: result.rows
        });
    } catch (error) {
        console.error("Supplier payment history error:", error.message);

        return res.status(500).json({
            success: false,
            message: "Could not load payment history."
        });
    }
});

// SUPPLIER MONTHLY NOTEBOOK
router.get("/:id/month/:year/:month", async (req, res) => {
    const businessId = req.session.user.business_id;
    const supplierId = validId(req.params.id);
    const year = Number(req.params.year);
    const month = Number(req.params.month);

    if (!supplierId || !validMonth(year, month)) {
        return res.status(400).json({
            success: false,
            message: "Invalid supplier, year or month."
        });
    }

    try {
        const supplier = await getSupplier(
            pool, businessId, supplierId
        );

        if (!supplier) {
            return res.status(404).json({
                success: false,
                message: "Supplier not found."
            });
        }

        const { startDate, endDate } = monthDateRange(year, month);

        const [purchaseResult, paymentResult, closureResult] =
            await Promise.all([
                pool.query(
                    `SELECT id, purchase_number, purchase_date,
                            total_amount, notes
                     FROM purchases
                     WHERE business_id = $1 AND supplier_id = $2
                       AND purchase_date::date >= $3::date
                       AND purchase_date::date < $4::date
                     ORDER BY purchase_date ASC`,
                    [businessId, supplierId, startDate, endDate]
                ),

                pool.query(
                    `SELECT id, payment_date, amount, payment_method,
                            reference, notes
                     FROM supplier_payments
                     WHERE business_id = $1 AND supplier_id = $2
                       AND payment_date::date >= $3::date
                       AND payment_date::date < $4::date
                     ORDER BY payment_date ASC`,
                    [businessId, supplierId, startDate, endDate]
                ),

                pool.query(
                    `SELECT id, closed_at
                     FROM supplier_month_closures
                     WHERE business_id = $1 AND supplier_id = $2
                       AND year = $3 AND month = $4`,
                    [businessId, supplierId, year, month]
                )
            ]);

        const purchases = purchaseResult.rows;
        const payments = paymentResult.rows;
        const closure = closureResult.rows[0] || null;

        const purchaseTotal = purchases.reduce(
            (sum, item) => sum + Number(item.total_amount),
            0
        );

        const paymentTotal = payments.reduce(
            (sum, item) => sum + Number(item.amount),
            0
        );

        return res.json({
            success: true,
            supplier,
            year,
            month,
            purchases,
            payments,
            summary: {
                purchase_count: purchases.length,
                purchase_total: purchaseTotal,
                payment_count: payments.length,
                payment_total: paymentTotal,
                outstanding_balance: Math.max(
                    purchaseTotal - paymentTotal, 0
                ),
                supplier_credit: Math.max(
                    paymentTotal - purchaseTotal, 0
                )
            },
            closed: Boolean(closure),
            closure
        });
    } catch (error) {
        console.error("Supplier monthly notebook error:", error.message);

        return res.status(500).json({
            success: false,
            message: "Could not load supplier monthly notebook."
        });
    }
});

// CLOSE SUPPLIER MONTH PERMANENTLY
router.post("/:id/close-month", async (req, res) => {
    const businessId = req.session.user.business_id;
    const supplierId = validId(req.params.id);
    const year = Number(req.body.year);
    const month = Number(req.body.month);

    if (!supplierId || !validMonth(year, month)) {
        return res.status(400).json({
            success: false,
            message: "Valid supplier, year and month are required."
        });
    }

    const client = await pool.connect();

    try {
        await client.query("BEGIN");

        const supplier = await getSupplier(
            client, businessId, supplierId, true
        );

        if (!supplier) {
            await client.query("ROLLBACK");

            return res.status(404).json({
                success: false,
                message: "Supplier not found."
            });
        }

        const { startDate, endDate } = monthDateRange(year, month);

        const summaryResult = await client.query(
            `SELECT
                (SELECT COUNT(*) FROM purchases
                 WHERE business_id = $1 AND supplier_id = $2
                   AND purchase_date::date >= $3::date
                   AND purchase_date::date < $4::date) AS purchase_count,

                (SELECT COALESCE(SUM(total_amount), 0) FROM purchases
                 WHERE business_id = $1 AND supplier_id = $2
                   AND purchase_date::date >= $3::date
                   AND purchase_date::date < $4::date) AS purchase_total,

                (SELECT COUNT(*) FROM supplier_payments
                 WHERE business_id = $1 AND supplier_id = $2
                   AND payment_date::date >= $3::date
                   AND payment_date::date < $4::date) AS payment_count,

                (SELECT COALESCE(SUM(amount), 0) FROM supplier_payments
                 WHERE business_id = $1 AND supplier_id = $2
                   AND payment_date::date >= $3::date
                   AND payment_date::date < $4::date) AS payment_total`,
            [businessId, supplierId, startDate, endDate]
        );

        const closureResult = await client.query(
            `INSERT INTO supplier_month_closures
                (business_id, supplier_id, year, month, closed_by)
             VALUES ($1, $2, $3, $4, $5)
             ON CONFLICT (business_id, supplier_id, year, month)
             DO NOTHING
             RETURNING id`,
            [
                businessId,
                supplierId,
                year,
                month,
                req.session.user.id
            ]
        );

        if (closureResult.rowCount === 0) {
            await client.query("ROLLBACK");

            return res.status(409).json({
                success: false,
                message: "This supplier month is already closed."
            });
        }

        await client.query("COMMIT");

        const summary = summaryResult.rows[0];

        return res.json({
            success: true,
            message: "Supplier month permanently closed.",
            closureId: closureResult.rows[0].id,
            summary: {
                purchase_count: Number(summary.purchase_count),
                purchase_total: Number(summary.purchase_total),
                payment_count: Number(summary.payment_count),
                payment_total: Number(summary.payment_total)
            }
        });
    } catch (error) {
        await client.query("ROLLBACK").catch(() => {});

        console.error("Supplier month closure error:", error.message);

        return res.status(500).json({
            success: false,
            message: "Could not close supplier month."
        });
    } finally {
        client.release();
    }
});

module.exports = router;
