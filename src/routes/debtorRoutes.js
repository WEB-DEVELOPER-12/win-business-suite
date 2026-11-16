const express = require("express");
const crypto = require("crypto");
const db = require("../config/database");
const requireAuth = require("../middleware/requireAuth");

const {
    ensureBusinessNotebooks,
    ensureCustomerNotebooks,
    kenyaDateParts,
    addDays,
    getMonthStart,
    getNextMonthStart,
    getTotalsBetween,
    getBalanceBefore
} = require("../services/debtorNotebookService");

const router = express.Router();

router.use(requireAuth);

function validId(value) {
    const id = Number(value);
    return Number.isInteger(id) && id > 0 ? id : null;
}

function cleanText(value, maxLength = 255) {
    if (typeof value !== "string") return "";
    return value.trim().slice(0, maxLength);
}

function roundMoney(value) {
    return Number((Number(value) || 0).toFixed(2));
}

function validCreditLimit(value) {
    const amount = Number(value);

    return Number.isFinite(amount) &&
        amount >= 0 &&
        amount <= 1000000000000;
}

function calculateDebtorStatus(totalDebtValue, totalPaidValue) {
    const totalDebt = roundMoney(totalDebtValue);
    const totalPaid = roundMoney(totalPaidValue);

    const netBalance = roundMoney(totalDebt - totalPaid);
    const balance = Math.max(0, netBalance);
    const customerCredit = Math.max(0, -netBalance);

    let status;

    if (totalDebt === 0 && totalPaid === 0) {
        status = "no_activity";
    } else if (customerCredit > 0) {
        status = "customer_credit";
    } else if (balance > 0 && totalPaid > 0) {
        status = "partially_paid";
    } else if (balance > 0) {
        status = "unpaid";
    } else {
        status = "paid";
    }

    return {
        total_debt: totalDebt,
        total_paid: totalPaid,
        balance,
        customer_credit: customerCredit,
        net_balance: netBalance,
        status
    };
}

function parseDate(value) {
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

    return {
        date: value,
        year,
        month,
        day
    };
}

function parseYear(value) {
    const year = Number(value);

    if (
        !Number.isInteger(year) ||
        year < 2000 ||
        year > 9999
    ) {
        return null;
    }

    return year;
}

function parseMonth(value) {
    const month = Number(value);

    if (
        !Number.isInteger(month) ||
        month < 1 ||
        month > 12
    ) {
        return null;
    }

    return month;
}

function run(sql, params = []) {
    return new Promise((resolve, reject) => {
        db.run(sql, params, function (error) {
            if (error) return reject(error);

            resolve({
                lastID: this.lastID,
                changes: this.changes
            });
        });
    });
}

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
            resolve(rows);
        });
    });
}

async function getDebtor(businessId, debtorId) {
    return get(
        `SELECT *
         FROM customers
         WHERE id = ?
           AND business_id = ?`,
        [debtorId, businessId]
    );
}

async function getDebtorBalances(businessId, debtorId) {
    return get(
        `SELECT
            COALESCE((
                SELECT SUM(total_amount)
                FROM debtor_transactions
                WHERE customer_id = ?
                  AND business_id = ?
            ), 0) AS total_debt,

            COALESCE((
                SELECT SUM(amount)
                FROM debtor_payments
                WHERE customer_id = ?
                  AND business_id = ?
            ), 0) AS total_paid`,
        [
            debtorId,
            businessId,
            debtorId,
            businessId
        ]
    );
}

async function getNotebookStatus(
    businessId,
    debtorId,
    date,
    year,
    month
) {
    const [daily, monthly] = await Promise.all([
        get(
            `SELECT *
             FROM debtor_daily_notebooks
             WHERE business_id = ?
               AND customer_id = ?
               AND notebook_date = ?`,
            [businessId, debtorId, date]
        ),
        get(
            `SELECT *
             FROM debtor_monthly_notebooks
             WHERE business_id = ?
               AND customer_id = ?
               AND year = ?
               AND month = ?`,
            [businessId, debtorId, year, month]
        )
    ]);

    return { daily, monthly };
}

async function getDailySnapshot(businessId, debtorId, date) {
    const nextDate = addDays(date, 1);

    const [openingBalance, totals] = await Promise.all([
        getBalanceBefore(businessId, debtorId, date),
        getTotalsBetween(
            businessId,
            debtorId,
            date,
            nextDate
        )
    ]);

    const closingBalance = roundMoney(
        openingBalance +
        totals.debtAdded -
        totals.paymentsReceived
    );

    const today = kenyaDateParts().date;

    return {
        notebook_date: date,
        opening_balance: roundMoney(openingBalance),
        debt_added: totals.debtAdded,
        payments_received: totals.paymentsReceived,
        closing_balance: closingBalance,
        balance: Math.max(0, closingBalance),
        customer_credit: Math.max(0, -closingBalance),
        status: date < today ? "closed" : "open"
    };
}

async function getMonthlySnapshot(
    businessId,
    debtorId,
    year,
    month
) {
    const startDate = getMonthStart(year, month);
    const endDate = getNextMonthStart(year, month);

    const [openingBalance, totals] = await Promise.all([
        getBalanceBefore(
            businessId,
            debtorId,
            startDate
        ),
        getTotalsBetween(
            businessId,
            debtorId,
            startDate,
            endDate
        )
    ]);

    const closingBalance = roundMoney(
        openingBalance +
        totals.debtAdded -
        totals.paymentsReceived
    );

    const today = kenyaDateParts();

    const isCurrentMonth =
        year === today.year &&
        month === today.month;

    return {
        year,
        month,
        period_start: startDate,
        period_end: endDate,
        opening_balance: roundMoney(openingBalance),
        debt_added: totals.debtAdded,
        payments_received: totals.paymentsReceived,
        closing_balance: closingBalance,
        balance: Math.max(0, closingBalance),
        customer_credit: Math.max(0, -closingBalance),
        status: isCurrentMonth ? "open" : "closed"
    };
}

function getReportRange(period, query) {
    const today = kenyaDateParts();

    if (period === "daily") {
        const selectedDate = query.date
            ? parseDate(query.date)
            : parseDate(today.date);

        if (!selectedDate) return null;

        return {
            startDate: selectedDate.date,
            endDate: addDays(selectedDate.date, 1),
            label: selectedDate.date,
            year: selectedDate.year,
            month: selectedDate.month
        };
    }

    if (period === "monthly") {
        const year = parseYear(query.year || today.year);
        const month = parseMonth(query.month || today.month);

        if (!year || !month) return null;

        return {
            startDate: getMonthStart(year, month),
            endDate: getNextMonthStart(year, month),
            label: `${year}-${String(month).padStart(2, "0")}`,
            year,
            month
        };
    }

    if (period === "yearly") {
        const year = parseYear(query.year || today.year);

        if (!year) return null;

        return {
            startDate: `${year}-01-01`,
            endDate: `${year + 1}-01-01`,
            label: String(year),
            year
        };
    }

    return null;
}

// ======================================================
// GET ALL DEBTORS
// ======================================================

router.get("/", async (req, res) => {
    const businessId = req.session.user.business_id;
    const search = cleanText(req.query.search, 100);

    try {
        await ensureBusinessNotebooks(businessId);

        const debtors = await all(
            `SELECT
                c.id,
                c.full_name,
                c.phone,
                c.email,
                c.address,
                c.credit_limit,
                c.credit_enabled,
                c.created_at,

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
               AND (
                    c.full_name LIKE ?
                    OR COALESCE(c.phone, '') LIKE ?
               )
             ORDER BY c.full_name COLLATE NOCASE ASC`,
            [
                businessId,
                `%${search}%`,
                `%${search}%`
            ]
        );

        res.json({
            success: true,
            debtors: debtors.map(debtor => ({
                ...debtor,
                ...calculateDebtorStatus(
                    debtor.total_debt,
                    debtor.total_paid
                )
            }))
        });
    } catch (error) {
        console.error("Load debtors error:", error.message);

        res.status(500).json({
            success: false,
            message: "Could not load debtors."
        });
    }
});

// ======================================================
// CREATE DEBTOR
// ======================================================

router.post("/", async (req, res) => {
    const businessId = req.session.user.business_id;

    const fullName = cleanText(req.body.full_name, 150);
    const phone = cleanText(req.body.phone, 30);
    const email = cleanText(req.body.email, 150);
    const address = cleanText(req.body.address, 250);
    const notes = cleanText(req.body.notes, 2000);

    const creditLimit =
        req.body.credit_limit === undefined ||
        req.body.credit_limit === ""
            ? 0
            : Number(req.body.credit_limit);

    if (!fullName) {
        return res.status(400).json({
            success: false,
            message: "Enter the debtor's full name."
        });
    }

    if (!validCreditLimit(creditLimit)) {
        return res.status(400).json({
            success: false,
            message: "Enter a valid credit limit."
        });
    }

    if (
        email &&
        !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
    ) {
        return res.status(400).json({
            success: false,
            message: "Enter a valid email address."
        });
    }

    try {
        const result = await run(
            `INSERT INTO customers (
                business_id,
                full_name,
                phone,
                email,
                address,
                notes,
                credit_limit,
                credit_enabled
            ) VALUES (?, ?, ?, ?, ?, ?, ?, 1)`,
            [
                businessId,
                fullName,
                phone || null,
                email || null,
                address || null,
                notes || null,
                creditLimit
            ]
        );

        res.status(201).json({
            success: true,
            message: "Debtor registered successfully.",
            debtor_id: result.lastID
        });
    } catch (error) {
        console.error("Create debtor error:", error.message);

        res.status(500).json({
            success: false,
            message: "Could not register debtor."
        });
    }
});

// ======================================================
// RECORD GOODS TAKEN ON CREDIT
// ======================================================

router.post("/:id/transactions", async (req, res) => {
    const businessId = req.session.user.business_id;
    const userId = req.session.user.id;
    const debtorId = validId(req.params.id);

    if (!debtorId) {
        return res.status(400).json({
            success: false,
            message: "Invalid debtor ID."
        });
    }

    const items = req.body.items;
    const notes = cleanText(req.body.notes, 1000);

    if (
        !Array.isArray(items) ||
        items.length === 0 ||
        items.length > 100
    ) {
        return res.status(400).json({
            success: false,
            message: "Add between 1 and 100 product items."
        });
    }

    const requestedItems = [];
    const seenProductIds = new Set();

    for (const item of items) {
        const productId = validId(item?.product_id);
        const quantity = Number(item?.quantity);

        if (!productId) {
            return res.status(400).json({
                success: false,
                message: "One or more product IDs are invalid."
            });
        }

        if (!Number.isFinite(quantity) || quantity <= 0) {
            return res.status(400).json({
                success: false,
                message: "Every product quantity must be greater than zero."
            });
        }

        if (seenProductIds.has(productId)) {
            return res.status(400).json({
                success: false,
                message: "A product cannot appear more than once. Combine its quantity."
            });
        }

        seenProductIds.add(productId);
        requestedItems.push({
            productId,
            quantity
        });
    }

    const today = kenyaDateParts();

    const transactionNumber =
        `DBT-${Date.now()}-${crypto.randomBytes(3).toString("hex").toUpperCase()}`;

    let transactionStarted = false;

    try {
        await ensureCustomerNotebooks(businessId, debtorId);

        await run("BEGIN IMMEDIATE TRANSACTION");
        transactionStarted = true;

        const debtor = await get(
            `SELECT id, full_name, credit_limit, credit_enabled
             FROM customers
             WHERE id = ?
               AND business_id = ?`,
            [debtorId, businessId]
        );

        if (!debtor) {
            throw Object.assign(
                new Error("Debtor not found."),
                { statusCode: 404 }
            );
        }

        if (Number(debtor.credit_enabled) !== 1) {
            throw Object.assign(
                new Error("Credit is disabled for this debtor."),
                { statusCode: 400 }
            );
        }

        const products = [];
        let totalAmount = 0;

        for (const requested of requestedItems) {
            const product = await get(
                `SELECT
                    id,
                    product_name,
                    selling_price,
                    stock_quantity
                 FROM products
                 WHERE id = ?
                   AND business_id = ?`,
                [
                    requested.productId,
                    businessId
                ]
            );

            if (!product) {
                throw Object.assign(
                    new Error("A selected product was not found in your inventory."),
                    { statusCode: 400 }
                );
            }

            const price = Number(product.selling_price);
            const stock = Number(product.stock_quantity);

            if (
                !Number.isFinite(price) ||
                price < 0 ||
                !Number.isFinite(stock) ||
                stock < requested.quantity
            ) {
                throw Object.assign(
                    new Error(
                        `Insufficient stock for ${product.product_name}. Available: ${stock}.`
                    ),
                    { statusCode: 400 }
                );
            }

            const lineTotal = roundMoney(
                requested.quantity * price
            );

            totalAmount = roundMoney(
                totalAmount + lineTotal
            );

            products.push({
                ...product,
                quantity: requested.quantity,
                price,
                lineTotal
            });
        }

        const currentBalances = await getDebtorBalances(
            businessId,
            debtorId
        );

        const currentStatus = calculateDebtorStatus(
            currentBalances.total_debt,
            currentBalances.total_paid
        );

        const netAfter = roundMoney(
            currentStatus.net_balance + totalAmount
        );

        const projectedBalance = Math.max(0, netAfter);
        const projectedCredit = Math.max(0, -netAfter);

        const creditLimit = Number(debtor.credit_limit) || 0;

        if (
            creditLimit > 0 &&
            projectedBalance > creditLimit
        ) {
            throw Object.assign(
                new Error(
                    `This transaction exceeds the debtor's credit limit. Current balance: ${currentStatus.balance.toFixed(2)}. Transaction: ${totalAmount.toFixed(2)}. Credit limit: ${creditLimit.toFixed(2)}.`
                ),
                { statusCode: 400 }
            );
        }

        const { daily, monthly } = await getNotebookStatus(
            businessId,
            debtorId,
            today.date,
            today.year,
            today.month
        );

        if (daily?.status === "closed") {
            throw Object.assign(
                new Error("Today's daily notebook is closed. This transaction cannot be added."),
                { statusCode: 409 }
            );
        }

        if (monthly?.status === "closed") {
            throw Object.assign(
                new Error("This monthly notebook is closed. This transaction cannot be added."),
                { statusCode: 409 }
            );
        }

        const transactionResult = await run(
            `INSERT INTO debtor_transactions (
                business_id,
                customer_id,
                transaction_number,
                transaction_date,
                total_amount,
                notes,
                created_by
            ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [
                businessId,
                debtorId,
                transactionNumber,
                today.date,
                totalAmount,
                notes || null,
                userId
            ]
        );

        for (const product of products) {
            await run(
                `INSERT INTO debtor_transaction_items (
                    transaction_id,
                    product_id,
                    product_name,
                    quantity,
                    unit_price,
                    line_total
                ) VALUES (?, ?, ?, ?, ?, ?)`,
                [
                    transactionResult.lastID,
                    product.id,
                    product.product_name,
                    product.quantity,
                    product.price,
                    product.lineTotal
                ]
            );

            const stockBefore = Number(product.stock_quantity);
            const stockAfter = roundMoney(
                stockBefore - product.quantity
            );

            const stockUpdate = await run(
                `UPDATE products
                 SET stock_quantity = stock_quantity - ?
                 WHERE id = ?
                   AND business_id = ?
                   AND stock_quantity >= ?`,
                [
                    product.quantity,
                    product.id,
                    businessId,
                    product.quantity
                ]
            );

            if (stockUpdate.changes !== 1) {
                throw Object.assign(
                    new Error(
                        `Stock changed while processing ${product.product_name}. Please try again.`
                    ),
                    { statusCode: 409 }
                );
            }

            await run(
                `INSERT INTO stock_movements (
                    business_id,
                    product_id,
                    movement_type,
                    quantity_before,
                    quantity_changed,
                    quantity_after,
                    reason,
                    reference_type,
                    reference_id,
                    created_by
                ) VALUES (?, ?, 'credit_sale', ?, ?, ?, ?, 'debtor_transaction', ?, ?)`,
                [
                    businessId,
                    product.id,
                    stockBefore,
                    -product.quantity,
                    stockAfter,
                    `Credit sale to ${debtor.full_name} (${transactionNumber})`,
                    transactionResult.lastID,
                    userId
                ]
            );
        }

        const dailyOpening = daily
            ? Number(daily.opening_balance)
            : await getBalanceBefore(
                businessId,
                debtorId,
                today.date
            );

        const monthlyOpening = monthly
            ? Number(monthly.opening_balance)
            : await getBalanceBefore(
                businessId,
                debtorId,
                getMonthStart(today.year, today.month)
            );

        if (daily) {
            const update = await run(
                `UPDATE debtor_daily_notebooks
                 SET
                    debt_added = debt_added + ?,
                    closing_balance = ?
                 WHERE id = ?
                   AND status = 'open'`,
                [
                    totalAmount,
                    netAfter,
                    daily.id
                ]
            );

            if (update.changes !== 1) {
                throw Object.assign(
                    new Error("The daily notebook is no longer open."),
                    { statusCode: 409 }
                );
            }
        } else {
            await run(
                `INSERT INTO debtor_daily_notebooks (
                    business_id,
                    customer_id,
                    notebook_date,
                    opening_balance,
                    debt_added,
                    payments_received,
                    closing_balance,
                    status
                ) VALUES (?, ?, ?, ?, ?, 0, ?, 'open')`,
                [
                    businessId,
                    debtorId,
                    today.date,
                    dailyOpening,
                    totalAmount,
                    netAfter
                ]
            );
        }

        if (monthly) {
            const update = await run(
                `UPDATE debtor_monthly_notebooks
                 SET
                    debt_added = debt_added + ?,
                    closing_balance = ?
                 WHERE id = ?
                   AND status = 'open'`,
                [
                    totalAmount,
                    netAfter,
                    monthly.id
                ]
            );

            if (update.changes !== 1) {
                throw Object.assign(
                    new Error("The monthly notebook is no longer open."),
                    { statusCode: 409 }
                );
            }
        } else {
            await run(
                `INSERT INTO debtor_monthly_notebooks (
                    business_id,
                    customer_id,
                    year,
                    month,
                    opening_balance,
                    debt_added,
                    payments_received,
                    closing_balance,
                    status
                ) VALUES (?, ?, ?, ?, ?, ?, 0, ?, 'open')`,
                [
                    businessId,
                    debtorId,
                    today.year,
                    today.month,
                    monthlyOpening,
                    totalAmount,
                    netAfter
                ]
            );
        }

        await run("COMMIT");
        transactionStarted = false;

        res.status(201).json({
            success: true,
            message: "Credit transaction recorded successfully.",
            transaction: {
                id: transactionResult.lastID,
                transaction_number: transactionNumber,
                transaction_date: today.date,
                debtor_id: debtorId,
                debtor_name: debtor.full_name,
                total_amount: totalAmount,
                items: products.map(product => ({
                    product_id: product.id,
                    product_name: product.product_name,
                    quantity: product.quantity,
                    unit_price: product.price,
                    line_total: product.lineTotal
                })),
                new_balance: projectedBalance,
                customer_credit: projectedCredit,
                net_balance: netAfter
            }
        });
    } catch (error) {
        if (transactionStarted) {
            try {
                await run("ROLLBACK");
            } catch (rollbackError) {
                console.error(
                    "Credit transaction rollback error:",
                    rollbackError.message
                );
            }
        }

        console.error(
            "Credit transaction error:",
            error.message
        );

        res.status(error.statusCode || 500).json({
            success: false,
            message: error.statusCode
                ? error.message
                : "Could not record the credit transaction. No changes were saved."
        });
    }
});

// ======================================================
// RECORD DEBTOR PAYMENT
// ======================================================

router.post("/:id/payments", async (req, res) => {
    const businessId = req.session.user.business_id;
    const userId = req.session.user.id;
    const debtorId = validId(req.params.id);

    if (!debtorId) {
        return res.status(400).json({
            success: false,
            message: "Invalid debtor ID."
        });
    }

    const amount = Number(req.body.amount);
    const paymentType = cleanText(
        req.body.payment_type,
        30
    ).toLowerCase();

    const paymentMethod = cleanText(
        req.body.payment_method,
        30
    ).toLowerCase();

    const reference = cleanText(req.body.reference, 150);
    const notes = cleanText(req.body.notes, 1000);
    const paymentDate = parseDate(req.body.payment_date);

    const allowedTypes = [
        "full",
        "partial",
        "overpayment"
    ];

    const allowedMethods = [
        "cash",
        "mpesa",
        "bank_transfer",
        "other"
    ];

    if (
        !Number.isFinite(amount) ||
        amount <= 0 ||
        amount > 1000000000000
    ) {
        return res.status(400).json({
            success: false,
            message: "Enter a valid payment amount greater than zero."
        });
    }

    if (!allowedTypes.includes(paymentType)) {
        return res.status(400).json({
            success: false,
            message: "Choose full payment, partial payment, or overpayment."
        });
    }

    if (!allowedMethods.includes(paymentMethod)) {
        return res.status(400).json({
            success: false,
            message: "Choose a valid payment method."
        });
    }

    if (!paymentDate) {
        return res.status(400).json({
            success: false,
            message: "Enter a valid payment date."
        });
    }

    const today = kenyaDateParts();

    if (paymentDate.date < today.date) {
        return res.status(409).json({
            success: false,
            message: "This payment date belongs to a closed daily notebook. Choose today instead."
        });
    }

    if (paymentDate.date > today.date) {
        return res.status(400).json({
            success: false,
            message: "Payment date cannot be in the future."
        });
    }

    const roundedAmount = roundMoney(amount);
    let transactionStarted = false;

    try {
        await ensureCustomerNotebooks(
            businessId,
            debtorId
        );

        await run("BEGIN IMMEDIATE TRANSACTION");
        transactionStarted = true;

        const debtor = await getDebtor(
            businessId,
            debtorId
        );

        if (!debtor) {
            throw Object.assign(
                new Error("Debtor not found."),
                { statusCode: 404 }
            );
        }

        const balances = await getDebtorBalances(
            businessId,
            debtorId
        );

        const currentStatus = calculateDebtorStatus(
            balances.total_debt,
            balances.total_paid
        );

        const currentBalance = roundMoney(
            currentStatus.balance
        );

        if (
            paymentType === "full" &&
            roundedAmount !== currentBalance
        ) {
            throw Object.assign(
                new Error(
                    `Full payment must equal the outstanding balance of ${currentBalance.toFixed(2)}.`
                ),
                { statusCode: 400 }
            );
        }

        if (
            paymentType === "partial" &&
            (
                currentBalance <= 0 ||
                roundedAmount >= currentBalance
            )
        ) {
            throw Object.assign(
                new Error(
                    "Partial payment must be greater than zero and less than the outstanding balance."
                ),
                { statusCode: 400 }
            );
        }

        if (
            paymentType === "overpayment" &&
            roundedAmount <= currentBalance
        ) {
            throw Object.assign(
                new Error(
                    "Overpayment must be greater than the outstanding balance."
                ),
                { statusCode: 400 }
            );
        }

        const newNetBalance = roundMoney(
            currentStatus.net_balance - roundedAmount
        );

        const newBalance = Math.max(0, newNetBalance);
        const customerCredit = Math.max(0, -newNetBalance);

        const { daily, monthly } = await getNotebookStatus(
            businessId,
            debtorId,
            paymentDate.date,
            today.year,
            today.month
        );

        if (daily?.status === "closed") {
            throw Object.assign(
                new Error("Today's daily notebook is closed. The payment cannot be added."),
                { statusCode: 409 }
            );
        }

        if (monthly?.status === "closed") {
            throw Object.assign(
                new Error("This monthly notebook is closed. The payment cannot be added."),
                { statusCode: 409 }
            );
        }

        const paymentResult = await run(
            `INSERT INTO debtor_payments (
                business_id,
                customer_id,
                payment_date,
                amount,
                payment_method,
                reference,
                notes,
                created_by
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                businessId,
                debtorId,
                paymentDate.date,
                roundedAmount,
                paymentMethod,
                reference || null,
                notes || null,
                userId
            ]
        );

        const dailyOpening = daily
            ? Number(daily.opening_balance)
            : await getBalanceBefore(
                businessId,
                debtorId,
                paymentDate.date
            );

        const monthlyOpening = monthly
            ? Number(monthly.opening_balance)
            : await getBalanceBefore(
                businessId,
                debtorId,
                getMonthStart(today.year, today.month)
            );

        if (daily) {
            const update = await run(
                `UPDATE debtor_daily_notebooks
                 SET
                    payments_received = payments_received + ?,
                    closing_balance = ?
                 WHERE id = ?
                   AND status = 'open'`,
                [
                    roundedAmount,
                    newNetBalance,
                    daily.id
                ]
            );

            if (update.changes !== 1) {
                throw Object.assign(
                    new Error("The daily notebook is no longer open."),
                    { statusCode: 409 }
                );
            }
        } else {
            await run(
                `INSERT INTO debtor_daily_notebooks (
                    business_id,
                    customer_id,
                    notebook_date,
                    opening_balance,
                    debt_added,
                    payments_received,
                    closing_balance,
                    status
                ) VALUES (?, ?, ?, ?, 0, ?, ?, 'open')`,
                [
                    businessId,
                    debtorId,
                    paymentDate.date,
                    dailyOpening,
                    roundedAmount,
                    newNetBalance
                ]
            );
        }

        if (monthly) {
            const update = await run(
                `UPDATE debtor_monthly_notebooks
                 SET
                    payments_received = payments_received + ?,
                    closing_balance = ?
                 WHERE id = ?
                   AND status = 'open'`,
                [
                    roundedAmount,
                    newNetBalance,
                    monthly.id
                ]
            );

            if (update.changes !== 1) {
                throw Object.assign(
                    new Error("The monthly notebook is no longer open."),
                    { statusCode: 409 }
                );
            }
        } else {
            await run(
                `INSERT INTO debtor_monthly_notebooks (
                    business_id,
                    customer_id,
                    year,
                    month,
                    opening_balance,
                    debt_added,
                    payments_received,
                    closing_balance,
                    status
                ) VALUES (?, ?, ?, ?, ?, 0, ?, ?, 'open')`,
                [
                    businessId,
                    debtorId,
                    today.year,
                    today.month,
                    monthlyOpening,
                    roundedAmount,
                    newNetBalance
                ]
            );
        }

        await run("COMMIT");
        transactionStarted = false;

        res.status(201).json({
            success: true,
            message: "Payment recorded successfully.",
            payment: {
                id: paymentResult.lastID,
                debtor_id: debtorId,
                debtor_name: debtor.full_name,
                payment_type: paymentType,
                payment_date: paymentDate.date,
                amount: roundedAmount,
                payment_method: paymentMethod,
                reference: reference || null,
                new_balance: newBalance,
                customer_credit: customerCredit,
                net_balance: newNetBalance
            }
        });
    } catch (error) {
        if (transactionStarted) {
            try {
                await run("ROLLBACK");
            } catch (rollbackError) {
                console.error(
                    "Payment rollback error:",
                    rollbackError.message
                );
            }
        }

        console.error(
            "Record debtor payment error:",
            error.message
        );

        res.status(error.statusCode || 500).json({
            success: false,
            message: error.statusCode
                ? error.message
                : "Could not record the payment. No changes were saved."
        });
    }
});

// ======================================================
// DAILY NOTEBOOK
// GET /api/debtors/:id/notebooks/daily?date=YYYY-MM-DD
// ======================================================

router.get("/:id/notebooks/daily", async (req, res) => {
    const businessId = req.session.user.business_id;
    const debtorId = validId(req.params.id);
    const selectedDate = req.query.date
        ? parseDate(req.query.date)
        : parseDate(kenyaDateParts().date);

    if (!debtorId) {
        return res.status(400).json({
            success: false,
            message: "Invalid debtor ID."
        });
    }

    if (!selectedDate) {
        return res.status(400).json({
            success: false,
            message: "Enter a valid notebook date."
        });
    }

    try {
        const debtor = await getDebtor(
            businessId,
            debtorId
        );

        if (!debtor) {
            return res.status(404).json({
                success: false,
                message: "Debtor not found."
            });
        }

        const notebook = await getDailySnapshot(
            businessId,
            debtorId,
            selectedDate.date
        );

        res.json({
            success: true,
            debtor_id: debtorId,
            notebook,
            summary: notebook
        });
    } catch (error) {
        console.error(
            "Load daily debtor notebook error:",
            error.message
        );

        res.status(500).json({
            success: false,
            message: "Could not load the daily notebook."
        });
    }
});

// ======================================================
// MONTHLY NOTEBOOK
// GET /api/debtors/:id/notebooks/monthly?year=YYYY&month=M
// ======================================================

router.get("/:id/notebooks/monthly", async (req, res) => {
    const businessId = req.session.user.business_id;
    const debtorId = validId(req.params.id);
    const today = kenyaDateParts();

    const year = parseYear(req.query.year || today.year);
    const month = parseMonth(req.query.month || today.month);

    if (!debtorId) {
        return res.status(400).json({
            success: false,
            message: "Invalid debtor ID."
        });
    }

    if (!year || !month) {
        return res.status(400).json({
            success: false,
            message: "Enter a valid year and month."
        });
    }

    try {
        const debtor = await getDebtor(
            businessId,
            debtorId
        );

        if (!debtor) {
            return res.status(404).json({
                success: false,
                message: "Debtor not found."
            });
        }

        const notebook = await getMonthlySnapshot(
            businessId,
            debtorId,
            year,
            month
        );

        res.json({
            success: true,
            debtor_id: debtorId,
            notebook,
            summary: notebook
        });
    } catch (error) {
        console.error(
            "Load monthly debtor notebook error:",
            error.message
        );

        res.status(500).json({
            success: false,
            message: "Could not load the monthly notebook."
        });
    }
});

// ======================================================
// YEARLY NOTEBOOK
// GET /api/debtors/:id/notebooks/yearly?year=YYYY
// ======================================================

router.get("/:id/notebooks/yearly", async (req, res) => {
    const businessId = req.session.user.business_id;
    const debtorId = validId(req.params.id);
    const today = kenyaDateParts();

    const year = parseYear(req.query.year || today.year);

    if (!debtorId) {
        return res.status(400).json({
            success: false,
            message: "Invalid debtor ID."
        });
    }

    if (!year) {
        return res.status(400).json({
            success: false,
            message: "Enter a valid year."
        });
    }

    try {
        const debtor = await getDebtor(
            businessId,
            debtorId
        );

        if (!debtor) {
            return res.status(404).json({
                success: false,
                message: "Debtor not found."
            });
        }

        const months = [];

        for (let month = 1; month <= 12; month++) {
            const notebook = await getMonthlySnapshot(
                businessId,
                debtorId,
                year,
                month
            );

            months.push(notebook);
        }

        const openingBalance = await getBalanceBefore(
            businessId,
            debtorId,
            `${year}-01-01`
        );

        const totalDebt = roundMoney(
            months.reduce(
                (sum, item) => sum + item.debt_added,
                0
            )
        );

        const totalPayments = roundMoney(
            months.reduce(
                (sum, item) => sum + item.payments_received,
                0
            )
        );

        const closingBalance = roundMoney(
            openingBalance + totalDebt - totalPayments
        );

        const notebook = {
            year,
            opening_balance: roundMoney(openingBalance),
            debt_added: totalDebt,
            payments_received: totalPayments,
            closing_balance: closingBalance,
            balance: Math.max(0, closingBalance),
            customer_credit: Math.max(0, -closingBalance),
            months
        };

        res.json({
            success: true,
            debtor_id: debtorId,
            notebook,
            summary: notebook,
            months
        });
    } catch (error) {
        console.error(
            "Load yearly debtor notebook error:",
            error.message
        );

        res.status(500).json({
            success: false,
            message: "Could not load the yearly notebook."
        });
    }
});

// ======================================================
// DEBTOR REPORTS
// GET /api/debtors/reports?period=daily|monthly|yearly
// ======================================================

router.get("/reports", async (req, res) => {
    const businessId = req.session.user.business_id;
    const period = cleanText(
        req.query.period || "daily",
        20
    ).toLowerCase();

    if (!["daily", "monthly", "yearly"].includes(period)) {
        return res.status(400).json({
            success: false,
            message: "Choose a daily, monthly, or yearly report."
        });
    }

    const range = getReportRange(period, req.query);

    if (!range) {
        return res.status(400).json({
            success: false,
            message: "The selected report date is invalid."
        });
    }

    try {
        const debtors = await all(
            `SELECT
                c.id,
                c.full_name,
                c.phone,

                COALESCE(t.total_debt, 0) AS total_debt,
                COALESCE(p.total_paid, 0) AS total_paid

             FROM customers c

             LEFT JOIN (
                SELECT
                    customer_id,
                    SUM(total_amount) AS total_debt
                FROM debtor_transactions
                WHERE business_id = ?
                  AND transaction_date >= ?
                  AND transaction_date < ?
                GROUP BY customer_id
             ) t ON t.customer_id = c.id

             LEFT JOIN (
                SELECT
                    customer_id,
                    SUM(amount) AS total_paid
                FROM debtor_payments
                WHERE business_id = ?
                  AND payment_date >= ?
                  AND payment_date < ?
                GROUP BY customer_id
             ) p ON p.customer_id = c.id

             WHERE c.business_id = ?
             ORDER BY c.full_name COLLATE NOCASE ASC`,
            [
                businessId,
                range.startDate,
                range.endDate,
                businessId,
                range.startDate,
                range.endDate,
                businessId
            ]
        );

        const reportDebtors = debtors.map(debtor => {
            const status = calculateDebtorStatus(
                debtor.total_debt,
                debtor.total_paid
            );

            return {
                id: debtor.id,
                full_name: debtor.full_name,
                phone: debtor.phone,
                ...status
            };
        });

        const totalDebt = roundMoney(
            reportDebtors.reduce(
                (sum, debtor) => sum + debtor.total_debt,
                0
            )
        );

        const totalPayments = roundMoney(
            reportDebtors.reduce(
                (sum, debtor) => sum + debtor.total_paid,
                0
            )
        );

        const totalOutstanding = roundMoney(
            reportDebtors.reduce(
                (sum, debtor) => sum + debtor.balance,
                0
            )
        );

        const totalCustomerCredit = roundMoney(
            reportDebtors.reduce(
                (sum, debtor) => sum + debtor.customer_credit,
                0
            )
        );

        const statusCounts = {
            unpaid: 0,
            partially_paid: 0,
            paid: 0,
            customer_credit: 0,
            no_activity: 0
        };

        for (const debtor of reportDebtors) {
            statusCounts[debtor.status] =
                (statusCounts[debtor.status] || 0) + 1;
        }

        const topDebtors = [...reportDebtors]
            .filter(debtor => debtor.balance > 0)
            .sort((a, b) => b.balance - a.balance)
            .slice(0, 10);

        const summary = {
            period,
            period_label: range.label,
            start_date: range.startDate,
            end_date: range.endDate,
            total_debt: totalDebt,
            total_payments: totalPayments,
            total_outstanding: totalOutstanding,
            total_customer_credit: totalCustomerCredit,
            debtor_count: reportDebtors.length,
            active_debtors: reportDebtors.filter(
                debtor => debtor.status !== "no_activity"
            ).length,
            status_counts: statusCounts
        };

        res.json({
            success: true,
            period,
            report: summary,
            summary,
            debtors: reportDebtors,
            top_debtors: topDebtors,
            status_counts: statusCounts
        });
    } catch (error) {
        console.error(
            "Load debtor reports error:",
            error.message
        );

        res.status(500).json({
            success: false,
            message: "Could not generate the debtor report."
        });
    }
});

// ======================================================
// GET DEBTOR TRANSACTION AND PAYMENT HISTORY
// ======================================================

router.get("/:id/history", async (req, res) => {
    const businessId = req.session.user.business_id;
    const debtorId = validId(req.params.id);

    if (!debtorId) {
        return res.status(400).json({
            success: false,
            message: "Invalid debtor ID."
        });
    }

    try {
        const debtor = await getDebtor(
            businessId,
            debtorId
        );

        if (!debtor) {
            return res.status(404).json({
                success: false,
                message: "Debtor not found."
            });
        }

        await ensureCustomerNotebooks(
            businessId,
            debtorId
        );

        const transactions = await all(
            `SELECT
                id,
                transaction_number,
                transaction_date,
                total_amount,
                notes,
                created_at
             FROM debtor_transactions
             WHERE customer_id = ?
               AND business_id = ?
             ORDER BY transaction_date DESC, id DESC`,
            [debtorId, businessId]
        );

        const payments = await all(
            `SELECT
                id,
                payment_date,
                amount,
                payment_method,
                reference,
                notes,
                created_at
             FROM debtor_payments
             WHERE customer_id = ?
               AND business_id = ?
             ORDER BY payment_date DESC, id DESC`,
            [debtorId, businessId]
        );

        const transactionIds = transactions.map(
            transaction => transaction.id
        );

        let transactionItems = [];

        if (transactionIds.length > 0) {
            const placeholders = transactionIds
                .map(() => "?")
                .join(",");

            transactionItems = await all(
                `SELECT
                    id,
                    transaction_id,
                    product_id,
                    product_name,
                    quantity,
                    unit_price,
                    line_total
                 FROM debtor_transaction_items
                 WHERE transaction_id IN (${placeholders})
                 ORDER BY id ASC`,
                transactionIds
            );
        }

        const itemsByTransaction = {};

        for (const item of transactionItems) {
            if (!itemsByTransaction[item.transaction_id]) {
                itemsByTransaction[item.transaction_id] = [];
            }

            itemsByTransaction[item.transaction_id].push(item);
        }

        res.json({
            success: true,
            debtor: {
                id: debtor.id,
                full_name: debtor.full_name
            },
            transactions: transactions.map(transaction => ({
                ...transaction,
                items: itemsByTransaction[transaction.id] || []
            })),
            payments
        });
    } catch (error) {
        console.error(
            "Load debtor history error:",
            error.message
        );

        res.status(500).json({
            success: false,
            message: "Could not load debtor history."
        });
    }
});

// ======================================================
// GET ONE DEBTOR PROFILE
// ======================================================

router.get("/:id", async (req, res) => {
    const businessId = req.session.user.business_id;
    const debtorId = validId(req.params.id);

    if (!debtorId) {
        return res.status(400).json({
            success: false,
            message: "Invalid debtor ID."
        });
    }

    try {
        const debtorExists = await getDebtor(
            businessId,
            debtorId
        );

        if (!debtorExists) {
            return res.status(404).json({
                success: false,
                message: "Debtor not found."
            });
        }

        await ensureCustomerNotebooks(
            businessId,
            debtorId
        );

        const debtor = await get(
            `SELECT
                c.id,
                c.full_name,
                c.phone,
                c.email,
                c.address,
                c.notes,
                c.credit_limit,
                c.credit_enabled,
                c.created_at,

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
             WHERE c.id = ?
               AND c.business_id = ?`,
            [debtorId, businessId]
        );

        res.json({
            success: true,
            debtor: {
                ...debtor,
                ...calculateDebtorStatus(
                    debtor.total_debt,
                    debtor.total_paid
                )
            }
        });
    } catch (error) {
        console.error(
            "Load debtor profile error:",
            error.message
        );

        res.status(500).json({
            success: false,
            message: "Could not load debtor profile."
        });
    }
});

// ======================================================
// UPDATE DEBTOR PROFILE
// ======================================================

router.put("/:id", async (req, res) => {
    const businessId = req.session.user.business_id;
    const debtorId = validId(req.params.id);

    if (!debtorId) {
        return res.status(400).json({
            success: false,
            message: "Invalid debtor ID."
        });
    }

    const fullName = cleanText(req.body.full_name, 150);
    const phone = cleanText(req.body.phone, 30);
    const email = cleanText(req.body.email, 150);
    const address = cleanText(req.body.address, 250);
    const notes = cleanText(req.body.notes, 2000);

    const creditLimit =
        req.body.credit_limit === undefined ||
        req.body.credit_limit === ""
            ? 0
            : Number(req.body.credit_limit);

    const creditEnabled =
        req.body.credit_enabled === true ||
        req.body.credit_enabled === 1 ||
        req.body.credit_enabled === "1"
            ? 1
            : 0;

    if (!fullName) {
        return res.status(400).json({
            success: false,
            message: "Debtor's full name is required."
        });
    }

    if (!validCreditLimit(creditLimit)) {
        return res.status(400).json({
            success: false,
            message: "Enter a valid credit limit."
        });
    }

    if (
        email &&
        !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
    ) {
        return res.status(400).json({
            success: false,
            message: "Enter a valid email address."
        });
    }

    try {
        const result = await run(
            `UPDATE customers
             SET
                full_name = ?,
                phone = ?,
                email = ?,
                address = ?,
                notes = ?,
                credit_limit = ?,
                credit_enabled = ?
             WHERE id = ?
               AND business_id = ?`,
            [
                fullName,
                phone || null,
                email || null,
                address || null,
                notes || null,
                creditLimit,
                creditEnabled,
                debtorId,
                businessId
            ]
        );

        if (result.changes === 0) {
            return res.status(404).json({
                success: false,
                message: "Debtor not found."
            });
        }

        res.json({
            success: true,
            message: "Debtor profile updated successfully."
        });
    } catch (error) {
        console.error(
            "Update debtor error:",
            error.message
        );

        res.status(500).json({
            success: false,
            message: "Could not update debtor profile."
        });
    }
});

module.exports = router;