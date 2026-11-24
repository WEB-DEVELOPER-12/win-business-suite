
const express = require("express");
const crypto = require("crypto");
const db = require("../config/database");
const requireAuth = require("../middleware/requireAuth");
const {
    ensureBusinessNotebooks,
    ensureCustomerNotebooks,
    kenyaDateParts
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

function validCreditLimit(value) {
    const amount = Number(value);
    return Number.isFinite(amount) &&
        amount >= 0 &&
        amount <= 1000000000000;
}

function calculateDebtorStatus(totalDebtValue, totalPaidValue) {
    const totalDebt = Number(totalDebtValue) || 0;
    const totalPaid = Number(totalPaidValue) || 0;

    const netBalance = totalDebt - totalPaid;
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
        status
    };
}

function parsePaymentDate(value) {
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

    return { date: value, year, month };
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

// GET ALL DEBTORS
router.get("/", async (req, res) => {
    const businessId = req.session.user.business_id;
    const search = cleanText(req.query.search, 100);

    try {
        // Catch up expired notebooks for this business.
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
            [businessId, `%${search}%`, `%${search}%`]
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

// CREATE DEBTOR
router.post("/", (req, res) => {
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

    db.run(
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
        ],
        function (error) {
            if (error) {
                console.error("Create debtor error:", error.message);
                return res.status(500).json({
                    success: false,
                    message: "Could not register debtor."
                });
            }

            res.status(201).json({
                success: true,
                message: "Debtor registered successfully.",
                debtor_id: this.lastID
            });
        }
    );
});

// RECORD GOODS TAKEN ON CREDIT
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

    if (!Array.isArray(items) || items.length === 0 || items.length > 100) {
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
        requestedItems.push({ productId, quantity });
    }

    const { date, year, month } = kenyaDateParts();

    const transactionNumber =
        `DBT-${Date.now()}-${crypto.randomBytes(3).toString("hex").toUpperCase()}`;

    let transactionStarted = false;

    try {
        // Close expired periods before beginning today's transaction.
        await ensureCustomerNotebooks(businessId, debtorId);

        await run("BEGIN IMMEDIATE TRANSACTION");
        transactionStarted = true;

        const debtor = await get(
            `SELECT id, full_name, credit_limit, credit_enabled
             FROM customers
             WHERE id = ? AND business_id = ?`,
            [debtorId, businessId]
        );

        if (!debtor) {
            throw Object.assign(new Error("Debtor not found."), {
                statusCode: 404
            });
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
                `SELECT id, product_name, selling_price, stock_quantity
                 FROM products
                 WHERE id = ? AND business_id = ?`,
                [requested.productId, businessId]
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
                    new Error(`Insufficient stock for ${product.product_name}. Available: ${stock}.`),
                    { statusCode: 400 }
                );
            }

            const lineTotal = Number(
                (requested.quantity * price).toFixed(2)
            );

            totalAmount = Number(
                (totalAmount + lineTotal).toFixed(2)
            );

            products.push({
                ...product,
                quantity: requested.quantity,
                price,
                lineTotal
            });
        }

        const currentBalances = await get(
            `SELECT
                COALESCE((
                    SELECT SUM(total_amount)
                    FROM debtor_transactions
                    WHERE customer_id = ? AND business_id = ?
                ), 0) AS total_debt,
                COALESCE((
                    SELECT SUM(amount)
                    FROM debtor_payments
                    WHERE customer_id = ? AND business_id = ?
                ), 0) AS total_paid`,
            [debtorId, businessId, debtorId, businessId]
        );

        const netBefore =
            Number(currentBalances.total_debt) -
            Number(currentBalances.total_paid);

        const netAfter = Number(
            (netBefore + totalAmount).toFixed(2)
        );

        const projectedBalance = Math.max(0, netAfter);
        const projectedCredit = Math.max(0, -netAfter);

        const currentStatus = calculateDebtorStatus(
            currentBalances.total_debt,
            currentBalances.total_paid
        );

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

        const daily = await get(
            `SELECT id, status
             FROM debtor_daily_notebooks
             WHERE business_id = ?
               AND customer_id = ?
               AND notebook_date = ?`,
            [businessId, debtorId, date]
        );

        if (daily?.status === "closed") {
            throw Object.assign(
                new Error("Today's daily notebook is closed. This transaction cannot be added."),
                { statusCode: 409 }
            );
        }

        const monthly = await get(
            `SELECT id, status
             FROM debtor_monthly_notebooks
             WHERE business_id = ?
               AND customer_id = ?
               AND year = ?
               AND month = ?`,
            [businessId, debtorId, year, month]
        );

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
                date,
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
                    new Error(`Stock changed while processing ${product.product_name}. Please try again.`),
                    { statusCode: 409 }
                );
            }
        }

        const openingBalance = currentStatus.balance;

        if (!daily) {
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
                    date,
                    openingBalance,
                    totalAmount,
                    projectedBalance
                ]
            );
        } else {
            await run(
                `UPDATE debtor_daily_notebooks
                 SET debt_added = debt_added + ?,
                     closing_balance = ?
                 WHERE id = ? AND status = 'open'`,
                [totalAmount, projectedBalance, daily.id]
            );
        }

        if (!monthly) {
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
                    year,
                    month,
                    openingBalance,
                    totalAmount,
                    projectedBalance
                ]
            );
        } else {
            await run(
                `UPDATE debtor_monthly_notebooks
                 SET debt_added = debt_added + ?,
                     closing_balance = ?
                 WHERE id = ? AND status = 'open'`,
                [totalAmount, projectedBalance, monthly.id]
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
                transaction_date: date,
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
                customer_credit: projectedCredit
            }
        });
    } catch (error) {
        if (transactionStarted) {
            try {
                await run("ROLLBACK");
            } catch (rollbackError) {
                console.error("Credit transaction rollback error:", rollbackError.message);
            }
        }

        console.error("Credit transaction error:", error.message);

        res.status(error.statusCode || 500).json({
            success: false,
            message: error.statusCode
                ? error.message
                : "Could not record the credit transaction. No changes were saved."
        });
    }
});

// RECORD DEBTOR PAYMENT
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
    const paymentType = cleanText(req.body.payment_type, 30).toLowerCase();
    const paymentMethod = cleanText(req.body.payment_method, 30).toLowerCase();
    const reference = cleanText(req.body.reference, 150);
    const notes = cleanText(req.body.notes, 1000);
    const paymentDate = parsePaymentDate(req.body.payment_date);

    const allowedTypes = ["full", "partial", "overpayment"];
    const allowedMethods = ["cash", "mpesa", "bank_transfer", "other"];

    if (!Number.isFinite(amount) || amount <= 0 || amount > 1000000000000) {
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

    // A previous date belongs to a closed daily notebook.
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

    const roundedAmount = Number(amount.toFixed(2));
    let transactionStarted = false;

    try {
        await ensureCustomerNotebooks(businessId, debtorId);

        await run("BEGIN IMMEDIATE TRANSACTION");
        transactionStarted = true;

        const debtor = await get(
            `SELECT id, full_name
             FROM customers
             WHERE id = ? AND business_id = ?`,
            [debtorId, businessId]
        );

        if (!debtor) {
            throw Object.assign(new Error("Debtor not found."), {
                statusCode: 404
            });
        }

        const balances = await get(
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
            [debtorId, businessId, debtorId, businessId]
        );

        const currentStatus = calculateDebtorStatus(
            balances.total_debt,
            balances.total_paid
        );

        const currentBalance = Number(currentStatus.balance.toFixed(2));

        if (paymentType === "full" && roundedAmount !== currentBalance) {
            throw Object.assign(
                new Error(
                    `Full payment must equal the outstanding balance of KSh ${currentBalance.toFixed(2)}.`
                ),
                { statusCode: 400 }
            );
        }

        if (
            paymentType === "partial" &&
            (currentBalance <= 0 || roundedAmount >= currentBalance)
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

        const newNetBalance = Number(
            (
                Number(balances.total_debt) -
                Number(balances.total_paid) -
                roundedAmount
            ).toFixed(2)
        );

        const newBalance = Math.max(0, newNetBalance);
        const customerCredit = Math.max(0, -newNetBalance);

        const daily = await get(
            `SELECT id, status
             FROM debtor_daily_notebooks
             WHERE business_id = ?
               AND customer_id = ?
               AND notebook_date = ?`,
            [businessId, debtorId, today.date]
        );

        if (daily?.status === "closed") {
            throw Object.assign(
                new Error("Today's daily notebook is closed. The payment cannot be added."),
                { statusCode: 409 }
            );
        }

        const monthly = await get(
            `SELECT id, status
             FROM debtor_monthly_notebooks
             WHERE business_id = ?
               AND customer_id = ?
               AND year = ?
               AND month = ?`,
            [businessId, debtorId, today.year, today.month]
        );

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
                today.date,
                roundedAmount,
                paymentMethod,
                reference || null,
                notes || null,
                userId
            ]
        );

        if (!daily) {
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
                    today.date,
                    currentBalance,
                    roundedAmount,
                    newBalance
                ]
            );
        } else {
            const dailyUpdate = await run(
                `UPDATE debtor_daily_notebooks
                 SET payments_received = payments_received + ?,
                     closing_balance = ?
                 WHERE id = ? AND status = 'open'`,
                [roundedAmount, newBalance, daily.id]
            );

            if (dailyUpdate.changes !== 1) {
                throw Object.assign(
                    new Error("The daily notebook is no longer open. Payment was not saved."),
                    { statusCode: 409 }
                );
            }
        }

        if (!monthly) {
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
                    currentBalance,
                    roundedAmount,
                    newBalance
                ]
            );
        } else {
            const monthlyUpdate = await run(
                `UPDATE debtor_monthly_notebooks
                 SET payments_received = payments_received + ?,
                     closing_balance = ?
                 WHERE id = ? AND status = 'open'`,
                [roundedAmount, newBalance, monthly.id]
            );

            if (monthlyUpdate.changes !== 1) {
                throw Object.assign(
                    new Error("The monthly notebook is no longer open. Payment was not saved."),
                    { statusCode: 409 }
                );
            }
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
                payment_date: today.date,
                amount: roundedAmount,
                payment_method: paymentMethod,
                reference: reference || null,
                new_balance: newBalance,
                customer_credit: customerCredit
            }
        });
    } catch (error) {
        if (transactionStarted) {
            try {
                await run("ROLLBACK");
            } catch (rollbackError) {
                console.error("Payment rollback error:", rollbackError.message);
            }
        }

        console.error("Record debtor payment error:", error.message);

        res.status(error.statusCode || 500).json({
            success: false,
            message: error.statusCode
                ? error.message
                : "Could not record the payment. No changes were saved."
        });
    }
});

// GET DEBTOR TRANSACTION AND PAYMENT HISTORY
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
        const debtor = await get(
            `SELECT id, full_name
             FROM customers
             WHERE id = ? AND business_id = ?`,
            [debtorId, businessId]
        );

        if (!debtor) {
            return res.status(404).json({
                success: false,
                message: "Debtor not found."
            });
        }

        await ensureCustomerNotebooks(businessId, debtorId);

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

        const transactionIds = transactions.map(item => item.id);
        let transactionItems = [];

        if (transactionIds.length > 0) {
            const placeholders = transactionIds.map(() => "?").join(",");

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
        console.error("Load debtor history error:", error.message);

        res.status(500).json({
            success: false,
            message: "Could not load debtor history."
        });
    }
});

// GET ONE DEBTOR PROFILE
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
        await ensureCustomerNotebooks(businessId, debtorId);

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

        if (!debtor) {
            return res.status(404).json({
                success: false,
                message: "Debtor not found."
            });
        }

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
        console.error("Load debtor profile error:", error.message);

        res.status(500).json({
            success: false,
            message: "Could not load debtor profile."
        });
    }
});

// UPDATE DEBTOR PROFILE
router.put("/:id", (req, res) => {
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
    const creditLimit = Number(req.body.credit_limit);

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

    db.run(
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
        ],
        function (error) {
            if (error) {
                console.error("Update debtor error:", error.message);
                return res.status(500).json({
                    success: false,
                    message: "Could not update debtor profile."
                });
            }

            if (this.changes === 0) {
                return res.status(404).json({
                    success: false,
                    message: "Debtor not found."
                });
            }

            res.json({
                success: true,
                message: "Debtor profile updated successfully."
            });
        }
    );
});

module.exports = router;
