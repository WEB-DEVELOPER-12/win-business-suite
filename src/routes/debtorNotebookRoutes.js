
"use strict";

const express = require("express");
const db = require("../config/database");
const requireAuth = require("../middleware/requireAuth");

const {
    ensureCustomerNotebooks,
    kenyaDateParts,
    addDays,
    getBalanceBefore,
    getTotalsBetween
} = require("../services/debtorNotebookService");

const router = express.Router();

router.use(requireAuth);

function get(sql, params = []) {
    return new Promise((resolve, reject) => {
        db.get(sql, params, (error, row) => {
            if (error) return reject(error);
            resolve(row);
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

function validId(value) {
    const id = Number(value);
    return Number.isInteger(id) && id > 0 ? id : null;
}

function validYear(value) {
    const year = Number(value);

    return Number.isInteger(year) &&
        year >= 2000 &&
        year <= 2100
            ? year
            : null;
}

function validMonth(value) {
    const month = Number(value);

    return Number.isInteger(month) &&
        month >= 1 &&
        month <= 12
            ? month
            : null;
}

function validDate(value) {
    if (
        typeof value !== "string" ||
        !/^\d{4}-\d{2}-\d{2}$/.test(value)
    ) {
        return null;
    }

    const [year, month, day] = value.split("-").map(Number);
    const date = new Date(Date.UTC(year, month - 1, day));

    if (
        date.getUTCFullYear() !== year ||
        date.getUTCMonth() + 1 !== month ||
        date.getUTCDate() !== day
    ) {
        return null;
    }

    return value;
}

async function findCustomer(businessId, customerId) {
    return get(
        `SELECT id, full_name
         FROM customers
         WHERE id = ? AND business_id = ?`,
        [customerId, businessId]
    );
}

function roundMoney(value) {
    return Number((Number(value) || 0).toFixed(2));
}

// --------------------------------------------------
// SHOP-WIDE REPORTS AND STATISTICS
// GET /api/debtors/reports
// --------------------------------------------------

router.get("/reports", async (req, res) => {
    const businessId = req.session.user.business_id;
    const current = kenyaDateParts();

    const period = String(req.query.period || "daily").toLowerCase();

    if (!["daily", "monthly", "yearly"].includes(period)) {
        return res.status(400).json({
            success: false,
            message: "Choose daily, monthly or yearly reporting."
        });
    }

    let startDate;
    let endDate;
    let reportLabel;

    if (period === "daily") {
        const date = req.query.date === undefined
            ? current.date
            : validDate(req.query.date);

        if (!date || date > current.date) {
            return res.status(400).json({
                success: false,
                message: "Enter a valid date that is not in the future."
            });
        }

        startDate = date;
        endDate = addDays(date, 1);
        reportLabel = date;
    }

    if (period === "monthly") {
        const year = req.query.year === undefined
            ? current.year
            : validYear(req.query.year);

        const month = req.query.month === undefined
            ? current.month
            : validMonth(req.query.month);

        if (!year || !month) {
            return res.status(400).json({
                success: false,
                message: "Enter a valid year and month."
            });
        }

        startDate = `${year}-${String(month).padStart(2, "0")}-01`;

        const nextMonth = new Date(Date.UTC(year, month, 1));

        endDate = [
            nextMonth.getUTCFullYear(),
            String(nextMonth.getUTCMonth() + 1).padStart(2, "0"),
            "01"
        ].join("-");

        if (startDate > current.date) {
            return res.status(400).json({
                success: false,
                message: "Future reporting periods are not available."
            });
        }

        reportLabel = `${year}-${String(month).padStart(2, "0")}`;
    }

    if (period === "yearly") {
        const year = req.query.year === undefined
            ? current.year
            : validYear(req.query.year);

        if (!year) {
            return res.status(400).json({
                success: false,
                message: "Enter a valid year."
            });
        }

        startDate = `${year}-01-01`;
        endDate = `${year + 1}-01-01`;

        if (startDate > current.date) {
            return res.status(400).json({
                success: false,
                message: "Future reporting periods are not available."
            });
        }

        reportLabel = String(year);
    }

    try {
        await ensureBusinessReportsNotebooks(businessId);

        const [
            opening,
            periodTotals,
            currentTotals,
            statusRows,
            topDebtors,
            debtorCount
        ] = await Promise.all([
            get(
                `SELECT
                    COALESCE((
                        SELECT SUM(total_amount)
                        FROM debtor_transactions
                        WHERE business_id = ?
                          AND transaction_date < ?
                    ), 0) AS debt_before,

                    COALESCE((
                        SELECT SUM(amount)
                        FROM debtor_payments
                        WHERE business_id = ?
                          AND payment_date < ?
                    ), 0) AS payments_before`,
                [businessId, startDate, businessId, startDate]
            ),

            get(
                `SELECT
                    COALESCE((
                        SELECT SUM(total_amount)
                        FROM debtor_transactions
                        WHERE business_id = ?
                          AND transaction_date >= ?
                          AND transaction_date < ?
                    ), 0) AS goods_taken,

                    COALESCE((
                        SELECT SUM(amount)
                        FROM debtor_payments
                        WHERE business_id = ?
                          AND payment_date >= ?
                          AND payment_date < ?
                    ), 0) AS payments_received`,
                [
                    businessId, startDate, endDate,
                    businessId, startDate, endDate
                ]
            ),

            get(
                `SELECT
                    COALESCE((
                        SELECT SUM(total_amount)
                        FROM debtor_transactions
                        WHERE business_id = ?
                    ), 0) AS total_debt,

                    COALESCE((
                        SELECT SUM(amount)
                        FROM debtor_payments
                        WHERE business_id = ?
                    ), 0) AS total_paid`,
                [businessId, businessId]
            ),

            all(
                `SELECT
                    CASE
                        WHEN totals.total_debt = 0
                         AND totals.total_paid = 0
                            THEN 'no_activity'

                        WHEN totals.total_debt - totals.total_paid < 0
                            THEN 'customer_credit'

                        WHEN totals.total_debt - totals.total_paid > 0
                         AND totals.total_paid > 0
                            THEN 'partially_paid'

                        WHEN totals.total_debt - totals.total_paid > 0
                            THEN 'unpaid'

                        ELSE 'paid'
                    END AS status,
                    COUNT(*) AS count

                 FROM (
                    SELECT
                        c.id,
                        COALESCE((
                            SELECT SUM(t.total_amount)
                            FROM debtor_transactions t
                            WHERE t.customer_id = c.id
                              AND t.business_id = c.business_id
                        ), 0) AS total_debt,

                        COALESCE((
                            SELECT SUM(p.amount)
                            FROM debtor_payments p
                            WHERE p.customer_id = c.id
                              AND p.business_id = c.business_id
                        ), 0) AS total_paid

                    FROM customers c
                    WHERE c.business_id = ?
                 ) totals

                 GROUP BY status`,
                [businessId]
            ),

            // TOP 10 DEBTORS
            // Uses WHERE instead of HAVING because this
            // outer query is not an aggregate query.
            all(
                `SELECT
                    debtor_totals.id,
                    debtor_totals.full_name,
                    debtor_totals.phone,
                    debtor_totals.total_debt,
                    debtor_totals.total_paid

                 FROM (
                    SELECT
                        c.id,
                        c.full_name,
                        c.phone,

                        COALESCE((
                            SELECT SUM(t.total_amount)
                            FROM debtor_transactions t
                            WHERE t.customer_id = c.id
                              AND t.business_id = c.business_id
                        ), 0) AS total_debt,

                        COALESCE((
                            SELECT SUM(p.amount)
                            FROM debtor_payments p
                            WHERE p.customer_id = c.id
                              AND p.business_id = c.business_id
                        ), 0) AS total_paid

                    FROM customers c
                    WHERE c.business_id = ?
                 ) AS debtor_totals

                 WHERE debtor_totals.total_debt -
                       debtor_totals.total_paid > 0

                 ORDER BY
                    debtor_totals.total_debt -
                    debtor_totals.total_paid DESC

                 LIMIT 10`,
                [businessId]
            ),

            get(
                `SELECT COUNT(*) AS total
                 FROM customers
                 WHERE business_id = ?`,
                [businessId]
            )
        ]);

        const openingBalance = roundMoney(
            Number(opening.debt_before) -
            Number(opening.payments_before)
        );

        const goodsTaken = roundMoney(periodTotals.goods_taken);
        const paymentsReceived = roundMoney(periodTotals.payments_received);

        const closingBalance = roundMoney(
            openingBalance + goodsTaken - paymentsReceived
        );

        const totalDebt = roundMoney(currentTotals.total_debt);
        const totalPaid = roundMoney(currentTotals.total_paid);

        const outstandingDebt = roundMoney(
            Math.max(0, totalDebt - totalPaid)
        );

        const customerCredit = roundMoney(
            Math.max(0, totalPaid - totalDebt)
        );

        const statusCounts = {
            unpaid: 0,
            partially_paid: 0,
            paid: 0,
            customer_credit: 0,
            no_activity: 0
        };

        for (const row of statusRows) {
            statusCounts[row.status] = Number(row.count) || 0;
        }

        const formattedTopDebtors = topDebtors.map(debtor => ({
            id: debtor.id,
            full_name: debtor.full_name,
            phone: debtor.phone,
            total_debt: roundMoney(debtor.total_debt),
            total_paid: roundMoney(debtor.total_paid),
            balance: roundMoney(
                Math.max(
                    0,
                    Number(debtor.total_debt) -
                    Number(debtor.total_paid)
                )
            )
        }));

        return res.json({
            success: true,

            report: {
                period,
                label: reportLabel,
                start_date: startDate,
                end_date_exclusive: endDate,

                opening_balance: openingBalance,
                goods_taken: goodsTaken,
                payments_received: paymentsReceived,
                closing_balance: closingBalance,

                total_debtors: Number(debtorCount.total) || 0,

                total_goods_taken_all_time: totalDebt,
                total_payments_all_time: totalPaid,

                total_outstanding_debt: outstandingDebt,
                total_customer_credit: customerCredit,

                debtor_status_counts: statusCounts,
                top_debtors: formattedTopDebtors
            }
        });
    } catch (error) {
        console.error("Load debtor reports error:", error);

        return res.status(500).json({
            success: false,
            message: "Could not load debtor reports."
        });
    }
});

// Catch up notebooks for every customer in this business.
async function ensureBusinessReportsNotebooks(businessId) {
    const customers = await all(
        `SELECT id
         FROM customers
         WHERE business_id = ?`,
        [businessId]
    );

    for (const customer of customers) {
        await ensureCustomerNotebooks(businessId, customer.id);
    }
}

// --------------------------------------------------
// GET ONE DAILY NOTEBOOK SUMMARY
// --------------------------------------------------

router.get("/:id/notebooks/daily", async (req, res) => {
    const businessId = req.session.user.business_id;
    const customerId = validId(req.params.id);
    const today = kenyaDateParts().date;
    const date = validDate(req.query.date);

    if (!customerId || !date) {
        return res.status(400).json({
            success: false,
            message: "Enter a valid customer ID and notebook date."
        });
    }

    if (date > today) {
        return res.status(400).json({
            success: false,
            message: "Future notebook dates are not available."
        });
    }

    try {
        const customer = await findCustomer(businessId, customerId);

        if (!customer) {
            return res.status(404).json({
                success: false,
                message: "Customer not found."
            });
        }

        await ensureCustomerNotebooks(businessId, customerId);

        const notebook = await get(
            `SELECT
                id,
                opening_balance,
                debt_added,
                payments_received,
                closing_balance,
                status,
                closed_at
             FROM debtor_daily_notebooks
             WHERE business_id = ?
               AND customer_id = ?
               AND notebook_date = ?`,
            [businessId, customerId, date]
        );

        let summary = notebook;

        if (!summary) {
            const nextDate = addDays(date, 1);

            const [openingBalance, totals] = await Promise.all([
                getBalanceBefore(businessId, customerId, date),
                getTotalsBetween(
                    businessId,
                    customerId,
                    date,
                    nextDate
                )
            ]);

            const closingBalance = Number((
                openingBalance +
                totals.debtAdded -
                totals.paymentsReceived
            ).toFixed(2));

            summary = {
                id: null,
                opening_balance: openingBalance,
                debt_added: totals.debtAdded,
                payments_received: totals.paymentsReceived,
                closing_balance: closingBalance,
                status: date < today ? "closed" : "open",
                closed_at: null
            };
        }

        return res.json({
            success: true,
            customer: {
                id: customer.id,
                full_name: customer.full_name
            },
            notebook: {
                date,
                ...summary
            }
        });
    } catch (error) {
        console.error("Load daily notebook error:", error);

        return res.status(500).json({
            success: false,
            message: "Could not load the daily notebook."
        });
    }
});

// --------------------------------------------------
// GET ONE MONTH'S NOTEBOOK SUMMARY
// --------------------------------------------------

router.get("/:id/notebooks/monthly", async (req, res) => {
    const businessId = req.session.user.business_id;
    const customerId = validId(req.params.id);

    const current = kenyaDateParts();

    const year = req.query.year === undefined
        ? current.year
        : validYear(req.query.year);

    const month = req.query.month === undefined
        ? current.month
        : validMonth(req.query.month);

    if (!customerId || !year || !month) {
        return res.status(400).json({
            success: false,
            message: "Enter a valid customer ID, year and month."
        });
    }

    try {
        const customer = await findCustomer(businessId, customerId);

        if (!customer) {
            return res.status(404).json({
                success: false,
                message: "Customer not found."
            });
        }

        await ensureCustomerNotebooks(businessId, customerId);

        const notebook = await get(
            `SELECT
                id,
                business_id,
                customer_id,
                year,
                month,
                opening_balance,
                debt_added,
                payments_received,
                closing_balance,
                status,
                closed_at
             FROM debtor_monthly_notebooks
             WHERE business_id = ?
               AND customer_id = ?
               AND year = ?
               AND month = ?`,
            [businessId, customerId, year, month]
        );

        const summary = notebook || {
            id: null,
            business_id: businessId,
            customer_id: customerId,
            year,
            month,
            opening_balance: 0,
            debt_added: 0,
            payments_received: 0,
            closing_balance: 0,
            status: (
                year < current.year ||
                (year === current.year && month < current.month)
            ) ? "closed" : "open",
            closed_at: null
        };

        res.json({
            success: true,
            customer: {
                id: customer.id,
                full_name: customer.full_name
            },
            notebook: summary
        });
    } catch (error) {
        console.error("Load monthly notebook error:", error);

        res.status(500).json({
            success: false,
            message: "Could not load the monthly notebook."
        });
    }
});

// --------------------------------------------------
// GET YEARLY HISTORY, GROUPED BY MONTH
// --------------------------------------------------

router.get("/:id/notebooks/yearly", async (req, res) => {
    const businessId = req.session.user.business_id;
    const customerId = validId(req.params.id);

    const current = kenyaDateParts();

    const year = req.query.year === undefined
        ? current.year
        : validYear(req.query.year);

    if (!customerId || !year) {
        return res.status(400).json({
            success: false,
            message: "Enter a valid customer ID and year."
        });
    }

    try {
        const customer = await findCustomer(businessId, customerId);

        if (!customer) {
            return res.status(404).json({
                success: false,
                message: "Customer not found."
            });
        }

        await ensureCustomerNotebooks(businessId, customerId);

        const months = await all(
            `SELECT
                year,
                month,
                opening_balance,
                debt_added,
                payments_received,
                closing_balance,
                status,
                closed_at
             FROM debtor_monthly_notebooks
             WHERE business_id = ?
               AND customer_id = ?
               AND year = ?
             ORDER BY month ASC`,
            [businessId, customerId, year]
        );

        const totals = months.reduce((result, item) => {
            result.debt_added += Number(item.debt_added) || 0;
            result.payments_received += Number(item.payments_received) || 0;
            return result;
        }, {
            debt_added: 0,
            payments_received: 0
        });

        totals.debt_added = Number(totals.debt_added.toFixed(2));
        totals.payments_received = Number(
            totals.payments_received.toFixed(2)
        );

        const yearlySummary = {
            year,
            opening_balance: months.length
                ? Number(months[0].opening_balance) || 0
                : 0,
            debt_added: totals.debt_added,
            payments_received: totals.payments_received,
            closing_balance: months.length
                ? Number(months[months.length - 1].closing_balance) || 0
                : 0
        };

        res.json({
            success: true,
            customer: {
                id: customer.id,
                full_name: customer.full_name
            },
            year,
            summary: yearlySummary,
            months
        });
    } catch (error) {
        console.error("Load yearly notebook error:", error);

        res.status(500).json({
            success: false,
            message: "Could not load yearly notebook history."
        });
    }
});

module.exports = router;
