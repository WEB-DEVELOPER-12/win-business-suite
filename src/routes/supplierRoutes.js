
const express = require("express");
const router = express.Router();
const db = require("../config/database");
const requireAuth = require("../middleware/requireAuth");

router.use(requireAuth);

function validId(value) {
    const id = Number(value);
    return Number.isInteger(id) && id > 0 ? id : null;
}

function validDate(value) {
    return /^\d{4}-\d{2}-\d{2}$/.test(value) &&
        !Number.isNaN(Date.parse(value + "T00:00:00Z"));
}

function validMonth(year, month) {
    return Number.isInteger(year) &&
        year >= 2000 &&
        Number.isInteger(month) &&
        month >= 1 &&
        month <= 12;
}

function getSupplier(businessId, supplierId, callback) {
    db.get(
        `SELECT * FROM suppliers WHERE id = ? AND business_id = ?`,
        [supplierId, businessId],
        callback
    );
}

function checkClosedMonth(businessId, supplierId, date, callback) {
    const year = Number(date.slice(0, 4));
    const month = Number(date.slice(5, 7));

    db.get(
        `SELECT id FROM supplier_month_closures
         WHERE business_id = ? AND supplier_id = ?
         AND year = ? AND month = ?`,
        [businessId, supplierId, year, month],
        (error, closure) => {
            if (error) return callback(error);
            callback(null, Boolean(closure));
        }
    );
}

// GET ALL SUPPLIERS
router.get("/", (req, res) => {
    const businessId = req.session.user.business_id;

    const sql = `
        SELECT id, supplier_name, phone, email, notes, created_at
        FROM suppliers
        WHERE business_id = ?
        ORDER BY created_at DESC
    `;

    db.all(sql, [businessId], (error, suppliers) => {
        if (error) {
            console.error("Get suppliers error:", error.message);
            return res.status(500).json({
                success: false,
                message: "Could not load suppliers."
            });
        }

        res.json({ success: true, suppliers });
    });
});

// ADD SUPPLIER
router.post("/", (req, res) => {
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

    db.run(
        `INSERT INTO suppliers
         (business_id, supplier_name, phone, email, notes)
         VALUES (?, ?, ?, ?, ?)`,
        [businessId, supplierName, phone || null, email || null, notes || null],
        function (error) {
            if (error) {
                console.error("Add supplier error:", error.message);
                return res.status(500).json({
                    success: false,
                    message: "Could not add supplier."
                });
            }

            res.status(201).json({
                success: true,
                message: "Supplier added successfully.",
                supplierId: this.lastID
            });
        }
    );
});

// UPDATE SUPPLIER
router.put("/:id", (req, res) => {
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

    db.run(
        `UPDATE suppliers
         SET supplier_name = ?, phone = ?, email = ?, notes = ?
         WHERE id = ? AND business_id = ?`,
        [supplierName, phone || null, email || null, notes || null,
            supplierId, businessId],
        function (error) {
            if (error) {
                console.error("Update supplier error:", error.message);
                return res.status(500).json({
                    success: false,
                    message: "Could not update supplier."
                });
            }

            if (!this.changes) {
                return res.status(404).json({
                    success: false,
                    message: "Supplier not found."
                });
            }

            res.json({
                success: true,
                message: "Supplier updated successfully."
            });
        }
    );
});

// DELETE SUPPLIER — PROTECT FINANCIAL HISTORY
router.delete("/:id", (req, res) => {
    const businessId = req.session.user.business_id;
    const supplierId = validId(req.params.id);

    if (!supplierId) {
        return res.status(400).json({
            success: false,
            message: "Invalid supplier ID."
        });
    }

    getSupplier(businessId, supplierId, (error, supplier) => {
        if (error) {
            return res.status(500).json({
                success: false,
                message: "Could not check supplier."
            });
        }

        if (!supplier) {
            return res.status(404).json({
                success: false,
                message: "Supplier not found."
            });
        }

        db.get(
            `SELECT
                (SELECT COUNT(*) FROM purchases
                 WHERE business_id = ? AND supplier_id = ?) +
                (SELECT COUNT(*) FROM supplier_payments
                 WHERE business_id = ? AND supplier_id = ?) +
                (SELECT COUNT(*) FROM supplier_month_closures
                 WHERE business_id = ? AND supplier_id = ?) AS history_count`,
            [businessId, supplierId, businessId, supplierId,
                businessId, supplierId],
            (historyError, result) => {
                if (historyError) {
                    return res.status(500).json({
                        success: false,
                        message: "Could not check supplier history."
                    });
                }

                if (Number(result.history_count) > 0) {
                    return res.status(409).json({
                        success: false,
                        message: "This supplier has financial history and cannot be deleted."
                    });
                }

                db.run(
                    `DELETE FROM suppliers
                     WHERE id = ? AND business_id = ?`,
                    [supplierId, businessId],
                    function (deleteError) {
                        if (deleteError) {
                            return res.status(500).json({
                                success: false,
                                message: "Could not delete supplier."
                            });
                        }

                        res.json({
                            success: true,
                            message: "Supplier deleted successfully."
                        });
                    }
                );
            }
        );
    });
});

// SUPPLIER ACCOUNT OVERVIEW
router.get("/:id/overview", (req, res) => {
    const businessId = req.session.user.business_id;
    const supplierId = validId(req.params.id);

    if (!supplierId) {
        return res.status(400).json({
            success: false,
            message: "Invalid supplier ID."
        });
    }

    getSupplier(businessId, supplierId, (error, supplier) => {
        if (error || !supplier) {
            return res.status(error ? 500 : 404).json({
                success: false,
                message: error ? "Could not load supplier." : "Supplier not found."
            });
        }

        db.get(
            `SELECT
                COALESCE((SELECT SUM(total_amount)
                    FROM purchases
                    WHERE business_id = ? AND supplier_id = ?), 0)
                    AS total_purchases,

                COALESCE((SELECT SUM(amount)
                    FROM supplier_payments
                    WHERE business_id = ? AND supplier_id = ?), 0)
                    AS total_payments,

                (SELECT COUNT(*) FROM purchases
                    WHERE business_id = ? AND supplier_id = ?)
                    AS purchase_count,

                (SELECT COUNT(*) FROM supplier_payments
                    WHERE business_id = ? AND supplier_id = ?)
                    AS payment_count`,
            [businessId, supplierId, businessId, supplierId,
                businessId, supplierId, businessId, supplierId],
            (summaryError, summary) => {
                if (summaryError) {
                    return res.status(500).json({
                        success: false,
                        message: "Could not calculate supplier account."
                    });
                }

                const purchases = Number(summary.total_purchases);
                const payments = Number(summary.total_payments);

                res.json({
                    success: true,
                    supplier,
                    account: {
                        total_purchases: purchases,
                        total_payments: payments,
                        outstanding_balance: Math.max(purchases - payments, 0),
                        supplier_credit: Math.max(payments - purchases, 0),
                        purchase_count: summary.purchase_count,
                        payment_count: summary.payment_count
                    }
                });
            }
        );
    });
});

// RECORD SUPPLIER PAYMENT
router.post("/:id/payments", (req, res) => {
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

    getSupplier(businessId, supplierId, (error, supplier) => {
        if (error || !supplier) {
            return res.status(error ? 500 : 404).json({
                success: false,
                message: error ? "Could not check supplier." : "Supplier not found."
            });
        }

        checkClosedMonth(
            businessId, supplierId, paymentDate,
            (closureError, closed) => {
                if (closureError) {
                    return res.status(500).json({
                        success: false,
                        message: "Could not check month status."
                    });
                }

                if (closed) {
                    return res.status(409).json({
                        success: false,
                        message: "This supplier's month is closed. Payments cannot be added."
                    });
                }

                db.run(
                    `INSERT INTO supplier_payments
                     (business_id, supplier_id, payment_date, amount,
                      payment_method, reference, notes, created_by)
                     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
                    [
                        businessId,
                        supplierId,
                        paymentDate,
                        amount,
                        method || null,
                        reference || null,
                        notes || null,
                        req.session.user.id
                    ],
                    function (insertError) {
                        if (insertError) {
                            console.error("Supplier payment error:", insertError.message);
                            return res.status(500).json({
                                success: false,
                                message: "Could not record supplier payment."
                            });
                        }

                        res.status(201).json({
                            success: true,
                            message: "Supplier payment recorded successfully.",
                            paymentId: this.lastID
                        });
                    }
                );
            }
        );
    });
});

// SUPPLIER PAYMENT HISTORY
router.get("/:id/payments", (req, res) => {
    const businessId = req.session.user.business_id;
    const supplierId = validId(req.params.id);

    if (!supplierId) {
        return res.status(400).json({
            success: false,
            message: "Invalid supplier ID."
        });
    }

    getSupplier(businessId, supplierId, (error, supplier) => {
        if (error || !supplier) {
            return res.status(error ? 500 : 404).json({
                success: false,
                message: error ? "Could not check supplier." : "Supplier not found."
            });
        }

        db.all(
            `SELECT id, payment_date, amount, payment_method,
                    reference, notes, created_at
             FROM supplier_payments
             WHERE business_id = ? AND supplier_id = ?
             ORDER BY payment_date DESC, id DESC`,
            [businessId, supplierId],
            (paymentError, payments) => {
                if (paymentError) {
                    return res.status(500).json({
                        success: false,
                        message: "Could not load payment history."
                    });
                }

                res.json({ success: true, payments });
            }
        );
    });
});

// SUPPLIER MONTHLY NOTEBOOK
router.get("/:id/month/:year/:month", (req, res) => {
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

    getSupplier(businessId, supplierId, (error, supplier) => {
        if (error || !supplier) {
            return res.status(error ? 500 : 404).json({
                success: false,
                message: error ? "Could not check supplier." : "Supplier not found."
            });
        }

        const startDate =
            `${year}-${String(month).padStart(2, "0")}-01`;

        const nextMonthDate = new Date(Date.UTC(year, month, 1));
        const endDate = nextMonthDate.toISOString().slice(0, 10);

        db.all(
            `SELECT id, purchase_number, purchase_date,
                    total_amount, notes
             FROM purchases
             WHERE business_id = ? AND supplier_id = ?
               AND date(purchase_date) >= ?
               AND date(purchase_date) < ?
             ORDER BY purchase_date ASC`,
            [businessId, supplierId, startDate, endDate],
            (purchaseError, purchases) => {
                if (purchaseError) {
                    return res.status(500).json({
                        success: false,
                        message: "Could not load monthly purchases."
                    });
                }

                db.all(
                    `SELECT id, payment_date, amount, payment_method,
                            reference, notes
                     FROM supplier_payments
                     WHERE business_id = ? AND supplier_id = ?
                       AND payment_date >= ? AND payment_date < ?
                     ORDER BY payment_date ASC`,
                    [businessId, supplierId, startDate, endDate],
                    (paymentError, payments) => {
                        if (paymentError) {
                            return res.status(500).json({
                                success: false,
                                message: "Could not load monthly payments."
                            });
                        }

                        db.get(
                            `SELECT id, closed_at
                             FROM supplier_month_closures
                             WHERE business_id = ? AND supplier_id = ?
                               AND year = ? AND month = ?`,
                            [businessId, supplierId, year, month],
                            (closureError, closure) => {
                                if (closureError) {
                                    return res.status(500).json({
                                        success: false,
                                        message: "Could not load month status."
                                    });
                                }

                                const purchaseTotal = purchases.reduce(
                                    (sum, item) => sum + Number(item.total_amount),
                                    0
                                );

                                const paymentTotal = payments.reduce(
                                    (sum, item) => sum + Number(item.amount),
                                    0
                                );

                                res.json({
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
                                    closure: closure || null
                                });
                            }
                        );
                    }
                );
            }
        );
    });
});

// CLOSE SUPPLIER MONTH PERMANENTLY
router.post("/:id/close-month", (req, res) => {
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

    getSupplier(businessId, supplierId, (error, supplier) => {
        if (error || !supplier) {
            return res.status(error ? 500 : 404).json({
                success: false,
                message: error ? "Could not check supplier." : "Supplier not found."
            });
        }

        const startDate =
            `${year}-${String(month).padStart(2, "0")}-01`;

        const endDate =
            new Date(Date.UTC(year, month, 1)).toISOString().slice(0, 10);

        db.get(
            `SELECT
                (SELECT COUNT(*) FROM purchases
                 WHERE business_id = ? AND supplier_id = ?
                   AND date(purchase_date) >= ?
                   AND date(purchase_date) < ?) AS purchase_count,

                (SELECT COALESCE(SUM(total_amount), 0) FROM purchases
                 WHERE business_id = ? AND supplier_id = ?
                   AND date(purchase_date) >= ?
                   AND date(purchase_date) < ?) AS purchase_total,

                (SELECT COUNT(*) FROM supplier_payments
                 WHERE business_id = ? AND supplier_id = ?
                   AND payment_date >= ? AND payment_date < ?) AS payment_count,

                (SELECT COALESCE(SUM(amount), 0) FROM supplier_payments
                 WHERE business_id = ? AND supplier_id = ?
                   AND payment_date >= ? AND payment_date < ?) AS payment_total`,
            [
                businessId, supplierId, startDate, endDate,
                businessId, supplierId, startDate, endDate,
                businessId, supplierId, startDate, endDate,
                businessId, supplierId, startDate, endDate
            ],
            (summaryError, summary) => {
                if (summaryError) {
                    return res.status(500).json({
                        success: false,
                        message: "Could not prepare month closure."
                    });
                }

                db.run(
                    `INSERT INTO supplier_month_closures
                     (business_id, supplier_id, year, month, closed_by)
                     VALUES (?, ?, ?, ?, ?)`,
                    [
                        businessId,
                        supplierId,
                        year,
                        month,
                        req.session.user.id
                    ],
                    function (closeError) {
                        if (closeError) {
                            if (closeError.message.includes("UNIQUE")) {
                                return res.status(409).json({
                                    success: false,
                                    message: "This supplier month is already closed."
                                });
                            }

                            console.error("Month closure error:", closeError.message);
                            return res.status(500).json({
                                success: false,
                                message: "Could not close supplier month."
                            });
                        }

                        res.json({
                            success: true,
                            message: "Supplier month permanently closed.",
                            closureId: this.lastID,
                            summary: {
                                purchase_count: summary.purchase_count,
                                purchase_total: Number(summary.purchase_total),
                                payment_count: summary.payment_count,
                                payment_total: Number(summary.payment_total)
                            }
                        });
                    }
                );
            }
        );
    });
});

module.exports = router;
