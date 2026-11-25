const express = require("express");
const crypto = require("crypto");

const db = require("../config/postgresRouteDatabase");
const requireAuth = require("../middleware/requireAuth");
const {
    ensureCustomerNotebooks,
    kenyaDateParts
} = require("../services/debtorNotebookService");

const router = express.Router();

router.use(requireAuth);
router.use(db.middleware);

const PAYMENT_METHODS = [
    "cash",
    "mpesa",
    "bank_transfer",
    "other"
];

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

function roundMoney(value) {
    return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
}

function validId(value) {
    const id = Number(value);

    return Number.isInteger(id) && id > 0
        ? id
        : null;
}

function cleanText(value, maxLength = 250) {
    if (value === undefined || value === null) {
        return "";
    }

    return String(value).trim().slice(0, maxLength);
}

function validAmount(value) {
    const amount = Number(value);

    return Number.isFinite(amount) && amount >= 0
        ? roundMoney(amount)
        : null;
}

function getBusinessId(req) {
    return Number(req.session.user.business_id);
}

function getUserId(req) {
    return Number(req.session.user.id);
}

function createSaleNumber(date) {
    const datePart = date.replace(/-/g, "");
    const randomPart = crypto.randomBytes(5).toString("hex").toUpperCase();

    return `WIN-${datePart}-${randomPart}`;
}

async function rollbackTransaction() {
    try {
        await run("ROLLBACK");
    } catch (error) {
        console.error("Sale rollback error:", error.message);
    }
}

function sendError(res, message, status = 500) {
    return res.status(status).json({
        success: false,
        message
    });
}

function calculateDebtorBalance(totalDebt, totalPaid) {
    return roundMoney(
        Number(totalDebt || 0) - Number(totalPaid || 0)
    );
}

// --------------------------------------------------
// GET /api/sales
// --------------------------------------------------

router.get("/", async (req, res) => {
    try {
        const businessId = getBusinessId(req);

        const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
        const limit = Math.min(
            100,
            Math.max(1, Number.parseInt(req.query.limit, 10) || 25)
        );

        const offset = (page - 1) * limit;

        const conditions = ["s.business_id = ?"];
        const params = [businessId];

        const startDate = cleanText(req.query.start_date, 10);
        const endDate = cleanText(req.query.end_date, 10);
        const search = cleanText(req.query.search, 100);

        if (startDate) {
            if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate)) {
                return sendError(res, "Invalid start date.", 400);
            }

            conditions.push("s.sale_date >= ?");
            params.push(startDate);
        }

        if (endDate) {
            if (!/^\d{4}-\d{2}-\d{2}$/.test(endDate)) {
                return sendError(res, "Invalid end date.", 400);
            }

            conditions.push("s.sale_date <= ?");
            params.push(endDate);
        }

        if (search) {
            conditions.push(`(
                s.sale_number ILIKE ?
                OR s.notes ILIKE ?
                OR c.full_name ILIKE ?
                OR c.phone ILIKE ?
            )`);

            params.push(
                `%${search}%`,
                `%${search}%`,
                `%${search}%`,
                `%${search}%`
            );
        }

        const where = conditions.join(" AND ");

        const count = await get(
            `SELECT COUNT(*) AS total
             FROM sales s
             LEFT JOIN customers c
                ON c.id = s.customer_id
               AND c.business_id = s.business_id
             WHERE ${where}`,
            params
        );

        const sales = await all(
            `SELECT
                s.id,
                s.sale_number,
                s.customer_id,
                c.full_name AS customer_name,
                c.phone AS customer_phone,
                s.sale_date,
                s.subtotal,
                s.discount_amount,
                s.total_amount,
                s.amount_paid,
                s.balance_due,
                s.payment_status,
                s.status,
                s.notes,
                s.created_at,
                u.full_name AS cashier_name
             FROM sales s
             LEFT JOIN customers c
                ON c.id = s.customer_id
               AND c.business_id = s.business_id
             LEFT JOIN users u ON u.id = s.created_by
             WHERE ${where}
             ORDER BY s.id DESC
             LIMIT ? OFFSET ?`,
            [...params, limit, offset]
        );

        const total = Number(count?.total || 0);

        return res.json({
            success: true,
            sales,
            pagination: {
                page,
                limit,
                total,
                total_pages: Math.ceil(total / limit)
            }
        });
    } catch (error) {
        console.error("Sales list error:", error);

        return sendError(res, "Unable to load sales.");
    }
});

// --------------------------------------------------
// GET /api/sales/summary
// Sales, transactions, cost of goods and gross profit
// --------------------------------------------------

router.get("/summary", async (req, res) => {
    try {
        const businessId = getBusinessId(req);
        const today = kenyaDateParts().date;

        const startDate = cleanText(
            req.query.start_date || today,
            10
        );

        const endDate = cleanText(
            req.query.end_date || today,
            10
        );

        if (
            !/^\d{4}-\d{2}-\d{2}$/.test(startDate) ||
            !/^\d{4}-\d{2}-\d{2}$/.test(endDate) ||
            startDate > endDate
        ) {
            return sendError(res, "Invalid date range.", 400);
        }

        const summary = await get(
            `SELECT
                COUNT(*) AS total_sales,

                COALESCE(SUM(s.subtotal), 0) AS subtotal,

                COALESCE(SUM(s.discount_amount), 0) AS discounts,

                COALESCE(SUM(s.total_amount), 0) AS total_revenue,

                COALESCE(SUM(s.amount_paid), 0) AS amount_received,

                COALESCE(SUM(s.balance_due), 0) AS outstanding_balance,

                COALESCE((
                    SELECT SUM(
                        si.line_total -
                        (si.quantity * COALESCE(si.unit_cost, 0))
                    )
                    FROM sale_items si
                    INNER JOIN sales linked_sale
                        ON linked_sale.id = si.sale_id
                    WHERE linked_sale.business_id = ?
                      AND linked_sale.sale_date >= ?
                      AND linked_sale.sale_date <= ?
                      AND linked_sale.status = 'completed'
                ), 0) AS gross_profit,

                COALESCE((
                    SELECT SUM(
                        si.quantity * COALESCE(si.unit_cost, 0)
                    )
                    FROM sale_items si
                    INNER JOIN sales linked_sale
                        ON linked_sale.id = si.sale_id
                    WHERE linked_sale.business_id = ?
                      AND linked_sale.sale_date >= ?
                      AND linked_sale.sale_date <= ?
                      AND linked_sale.status = 'completed'
                ), 0) AS cost_of_goods

             FROM sales s
             WHERE s.business_id = ?
               AND s.sale_date >= ?
               AND s.sale_date <= ?
               AND s.status = 'completed'`,
            [
                businessId,
                startDate,
                endDate,
                businessId,
                startDate,
                endDate,
                businessId,
                startDate,
                endDate
            ]
        );

        return res.json({
            success: true,
            period: {
                start_date: startDate,
                end_date: endDate
            },
            summary: {
                total_sales: Number(summary.total_sales || 0),
                subtotal: roundMoney(summary.subtotal),
                discounts: roundMoney(summary.discounts),
                total_revenue: roundMoney(summary.total_revenue),
                amount_received: roundMoney(summary.amount_received),
                outstanding_balance: roundMoney(
                    summary.outstanding_balance
                ),
                cost_of_goods: roundMoney(summary.cost_of_goods),
                gross_profit: roundMoney(summary.gross_profit)
            }
        });
    } catch (error) {
        console.error("Sales summary error:", error);

        return sendError(res, "Unable to load sales summary.");
    }
});

// --------------------------------------------------
// GET /api/sales/:id
// --------------------------------------------------

router.get("/:id", async (req, res) => {
    try {
        const businessId = getBusinessId(req);
        const saleId = validId(req.params.id);

        if (!saleId) {
            return sendError(res, "Invalid sale ID.", 400);
        }

        const sale = await get(
            `SELECT
                s.*,
                c.full_name AS customer_name,
                c.phone AS customer_phone,
                u.full_name AS cashier_name
             FROM sales s
             LEFT JOIN customers c
                ON c.id = s.customer_id
               AND c.business_id = s.business_id
             LEFT JOIN users u ON u.id = s.created_by
             WHERE s.id = ?
               AND s.business_id = ?`,
            [saleId, businessId]
        );

        if (!sale) {
            return sendError(res, "Sale not found.", 404);
        }

        const items = await all(
            `SELECT
                id,
                product_id,
                product_name,
                quantity,
                unit_price,
                unit_cost,
                line_subtotal,
                discount_amount,
                line_total
             FROM sale_items
             WHERE sale_id = ?
             ORDER BY id`,
            [saleId]
        );

        const originalPayments = await all(
            `SELECT
                id,
                payment_date,
                amount,
                payment_method,
                reference,
                notes,
                'sale' AS payment_source
             FROM sale_payments
             WHERE sale_id = ?
               AND business_id = ?
             ORDER BY id`,
            [saleId, businessId]
        );

        const laterPayments = await all(
            `SELECT
                dp.id,
                dp.payment_date,
                dpa.amount,
                dp.payment_method,
                dp.reference,
                dp.notes,
                'debtor' AS payment_source
             FROM debtor_payment_allocations dpa
             JOIN debtor_payments dp
               ON dp.id = dpa.payment_id
              AND dp.business_id = dpa.business_id
             WHERE dpa.sale_id = ?
               AND dpa.business_id = ?
             ORDER BY dp.id`,
            [saleId, businessId]
        );

        return res.json({
            success: true,
            sale,
            items,
            payments: [...originalPayments, ...laterPayments]
        });
    } catch (error) {
        console.error("Sale details error:", error);

        return sendError(res, "Unable to load sale details.");
    }
});

// --------------------------------------------------
// POST /api/sales
// Create a sale and automatically create debtor
// records for any remaining unpaid balance.
// --------------------------------------------------

router.post("/", async (req, res) => {
    const businessId = getBusinessId(req);
    const userId = getUserId(req);

    let transactionStarted = false;

    try {
        const customerId = req.body.customer_id
            ? validId(req.body.customer_id)
            : null;

        if (req.body.customer_id && !customerId) {
            return sendError(res, "Invalid customer ID.", 400);
        }

        const notes = cleanText(req.body.notes, 1000);
        const items = req.body.items;
        const payments = req.body.payments ?? [];

        if (
            !Array.isArray(items) ||
            items.length === 0 ||
            items.length > 100
        ) {
            return sendError(
                res,
                "Add between 1 and 100 sale items.",
                400
            );
        }

        if (!Array.isArray(payments) || payments.length > 10) {
            return sendError(
                res,
                "Add between 0 and 10 payment entries.",
                400
            );
        }

        const seenProducts = new Set();

        for (const item of items) {
            const productId = validId(item?.product_id);
            const quantity = Number(item?.quantity);

            if (!productId) {
                return sendError(res, "Invalid product ID.", 400);
            }

            if (seenProducts.has(productId)) {
                return sendError(
                    res,
                    "A product can only appear once in a sale.",
                    400
                );
            }

            seenProducts.add(productId);

            if (!Number.isFinite(quantity) || quantity <= 0) {
                return sendError(
                    res,
                    "Every product quantity must be greater than zero.",
                    400
                );
            }
        }

        const normalizedPayments = [];

        for (const payment of payments) {
            const amount = validAmount(payment?.amount);
            const method = cleanText(
                payment?.payment_method,
                30
            ).toLowerCase();

            if (amount === null || amount <= 0) {
                return sendError(
                    res,
                    "Every payment amount must be greater than zero.",
                    400
                );
            }

            if (!PAYMENT_METHODS.includes(method)) {
                return sendError(
                    res,
                    "Invalid payment method.",
                    400
                );
            }

            normalizedPayments.push({
                amount,
                method,
                reference: cleanText(payment.reference, 100),
                notes: cleanText(payment.notes, 250)
            });
        }

        const requestedDiscount = validAmount(
            req.body.discount_amount ?? 0
        );

        if (requestedDiscount === null) {
            return sendError(res, "Invalid discount amount.", 400);
        }

        await run("BEGIN");
        transactionStarted = true;

        const saleItems = [];
        let subtotal = 0;

        for (const item of items) {
            const productId = Number(item.product_id);
            const quantity = Number(item.quantity);

            const product = await get(
                `SELECT
                    id,
                    product_name,
                    selling_price,
                    buying_price,
                    stock_quantity
                 FROM products
                 WHERE id = ?
                   AND business_id = ?
                 FOR UPDATE`,
                [productId, businessId]
            );

            if (!product) {
                throw new Error("PRODUCT_NOT_FOUND");
            }

            const sellingPrice = Number(product.selling_price);
            const buyingPrice = Number(product.buying_price);
            const availableStock = Number(product.stock_quantity);

            if (
                !Number.isFinite(sellingPrice) ||
                sellingPrice < 0 ||
                !Number.isFinite(buyingPrice) ||
                buyingPrice < 0
            ) {
                throw new Error("INVALID_PRODUCT_PRICE");
            }

            if (
                !Number.isFinite(availableStock) ||
                availableStock < quantity
            ) {
                throw new Error(
                    `INSUFFICIENT_STOCK:${product.product_name}`
                );
            }

            const lineSubtotal = roundMoney(
                quantity * sellingPrice
            );

            subtotal = roundMoney(subtotal + lineSubtotal);

            saleItems.push({
                product_id: product.id,
                product_name: product.product_name,
                quantity,
                unit_price: sellingPrice,
                unit_cost: buyingPrice,
                line_subtotal: lineSubtotal
            });
        }

        if (requestedDiscount > subtotal) {
            throw new Error("DISCOUNT_EXCEEDS_SUBTOTAL");
        }

        const totalAmount = roundMoney(
            subtotal - requestedDiscount
        );

        if (totalAmount <= 0) {
            throw new Error("INVALID_SALE_TOTAL");
        }

        const amountPaid = roundMoney(
            normalizedPayments.reduce(
                (sum, payment) => sum + payment.amount,
                0
            )
        );

        if (amountPaid > totalAmount) {
            throw new Error("PAYMENT_EXCEEDS_TOTAL");
        }

        const balanceDue = roundMoney(
            totalAmount - amountPaid
        );

        if (balanceDue > 0 && !customerId) {
            throw new Error("CUSTOMER_REQUIRED_FOR_CREDIT");
        }

        let customer = null;
        let debtorTransactionId = null;

        if (customerId) {
            customer = await get(
                `SELECT
                    id,
                    full_name,
                    credit_limit,
                    credit_enabled
                 FROM customers
                 WHERE id = ?
                   AND business_id = ?
                 FOR UPDATE`,
                [customerId, businessId]
            );

            if (!customer) {
                throw new Error("CUSTOMER_NOT_FOUND");
            }
        }

        if (balanceDue > 0) {
            if (Number(customer.credit_enabled) !== 1) {
                throw new Error("CUSTOMER_CREDIT_DISABLED");
            }

            await ensureCustomerNotebooks(businessId, customerId);

            const balances = await get(
                `SELECT
                    COALESCE((
                        SELECT SUM(total_amount)
                        FROM debtor_transactions
                        WHERE business_id = ?
                          AND customer_id = ?
                    ), 0) AS total_debt,

                    COALESCE((
                        SELECT SUM(amount)
                        FROM debtor_payments
                        WHERE business_id = ?
                          AND customer_id = ?
                    ), 0) AS total_paid`,
                [
                    businessId,
                    customerId,
                    businessId,
                    customerId
                ]
            );

            const existingNetBalance = calculateDebtorBalance(
                balances.total_debt,
                balances.total_paid
            );

            const projectedBalance = Math.max(
                0,
                roundMoney(existingNetBalance + balanceDue)
            );

            const creditLimit = Number(customer.credit_limit) || 0;

            if (
                creditLimit > 0 &&
                projectedBalance > creditLimit
            ) {
                throw new Error("CREDIT_LIMIT_EXCEEDED");
            }

            const today = kenyaDateParts();

            const daily = await get(
                `SELECT id, status
                 FROM debtor_daily_notebooks
                 WHERE business_id = ?
                   AND customer_id = ?
                   AND notebook_date = ?`,
                [businessId, customerId, today.date]
            );

            if (daily?.status === "closed") {
                throw new Error("DAILY_NOTEBOOK_CLOSED");
            }

            const monthly = await get(
                `SELECT id, status
                 FROM debtor_monthly_notebooks
                 WHERE business_id = ?
                   AND customer_id = ?
                   AND year = ?
                   AND month = ?`,
                [
                    businessId,
                    customerId,
                    today.year,
                    today.month
                ]
            );

            if (monthly?.status === "closed") {
                throw new Error("MONTHLY_NOTEBOOK_CLOSED");
            }
        }

        let allocatedDiscount = 0;

        for (let index = 0; index < saleItems.length; index++) {
            const item = saleItems[index];

            let itemDiscount = 0;

            if (requestedDiscount > 0) {
                if (index === saleItems.length - 1) {
                    itemDiscount = roundMoney(
                        requestedDiscount - allocatedDiscount
                    );
                } else {
                    itemDiscount = roundMoney(
                        requestedDiscount *
                        item.line_subtotal /
                        subtotal
                    );

                    allocatedDiscount = roundMoney(
                        allocatedDiscount + itemDiscount
                    );
                }
            }

            item.discount_amount = itemDiscount;
            item.line_total = roundMoney(
                item.line_subtotal - itemDiscount
            );
        }

        const saleDate = kenyaDateParts().date;
        const saleNumber = createSaleNumber(saleDate);

        const paymentStatus = balanceDue === 0
            ? "paid"
            : amountPaid > 0
                ? "partially_paid"
                : "unpaid";

        const saleResult = await run(
            `INSERT INTO sales (
                business_id,
                customer_id,
                sale_number,
                sale_date,
                subtotal,
                discount_amount,
                total_amount,
                amount_paid,
                balance_due,
                payment_status,
                status,
                notes,
                created_by
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                businessId,
                customerId,
                saleNumber,
                saleDate,
                subtotal,
                requestedDiscount,
                totalAmount,
                amountPaid,
                balanceDue,
                paymentStatus,
                "completed",
                notes,
                userId
            ]
        );

        const saleId = saleResult.lastID;

        for (const item of saleItems) {
            await run(
                `INSERT INTO sale_items (
                    sale_id,
                    product_id,
                    product_name,
                    quantity,
                    unit_price,
                    unit_cost,
                    line_subtotal,
                    discount_amount,
                    line_total
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                    saleId,
                    item.product_id,
                    item.product_name,
                    item.quantity,
                    item.unit_price,
                    item.unit_cost,
                    item.line_subtotal,
                    item.discount_amount,
                    item.line_total
                ]
            );

            const stockUpdate = await run(
                `UPDATE products
                 SET stock_quantity = stock_quantity - ?
                 WHERE id = ?
                   AND business_id = ?
                   AND stock_quantity >= ?`,
                [
                    item.quantity,
                    item.product_id,
                    businessId,
                    item.quantity
                ]
            );

            if (stockUpdate.changes !== 1) {
                throw new Error(
                    `INSUFFICIENT_STOCK:${item.product_name}`
                );
            }

            const quantityAfter = await get(
                `SELECT stock_quantity
                 FROM products
                 WHERE id = ?
                   AND business_id = ?`,
                [item.product_id, businessId]
            );

            if (!quantityAfter) {
                throw new Error("PRODUCT_NOT_FOUND");
            }

            const after = Number(quantityAfter.stock_quantity);
            const before = roundMoney(after + item.quantity);

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
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                    businessId,
                    item.product_id,
                    "stock_out",
                    before,
                    -item.quantity,
                    after,
                    `POS sale ${saleNumber}`,
                    "sale",
                    saleId,
                    userId
                ]
            );
        }

        for (const payment of normalizedPayments) {
            await run(
                `INSERT INTO sale_payments (
                    business_id,
                    sale_id,
                    payment_date,
                    amount,
                    payment_method,
                    reference,
                    notes,
                    created_by
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                    businessId,
                    saleId,
                    saleDate,
                    payment.amount,
                    payment.method,
                    payment.reference,
                    payment.notes,
                    userId
                ]
            );
        }

        if (balanceDue > 0) {
            const transactionNumber = `SALE-${saleNumber}`;

            const debtorResult = await run(
                `INSERT INTO debtor_transactions (
                    business_id,
                    customer_id,
                    sale_id,
                    transaction_number,
                    transaction_date,
                    total_amount,
                    notes,
                    created_by
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                    businessId,
                    customerId,
                    saleId,
                    transactionNumber,
                    saleDate,
                    balanceDue,
                    `Outstanding balance from POS sale ${saleNumber}`,
                    userId
                ]
            );

            debtorTransactionId = debtorResult.lastID;

            let allocatedDebt = 0;
            let remainingDebt = balanceDue;

            for (let index = 0; index < saleItems.length; index++) {
                const item = saleItems[index];

                let itemDebt = 0;

                if (index === saleItems.length - 1) {
                    itemDebt = roundMoney(remainingDebt);
                } else if (totalAmount > 0) {
                    itemDebt = roundMoney(
                        balanceDue *
                        item.line_total /
                        totalAmount
                    );

                    itemDebt = Math.min(
                        itemDebt,
                        roundMoney(remainingDebt)
                    );

                    allocatedDebt = roundMoney(
                        allocatedDebt + itemDebt
                    );

                    remainingDebt = roundMoney(
                        balanceDue - allocatedDebt
                    );
                }

                if (itemDebt <= 0) {
                    continue;
                }

                await run(
                    `INSERT INTO debtor_transaction_items (
                        transaction_id,
                        product_id,
                        product_name,
                        quantity,
                        unit_price,
                        line_total
                    )
                    VALUES (?, ?, ?, ?, ?, ?)`,
                    [
                        debtorTransactionId,
                        item.product_id,
                        item.product_name,
                        item.quantity,
                        roundMoney(itemDebt / item.quantity),
                        itemDebt
                    ]
                );
            }

            await ensureCustomerNotebooks(businessId, customerId);
        }

        await run("COMMIT");
        transactionStarted = false;

        return res.status(201).json({
            success: true,
            message: balanceDue > 0
                ? "Sale recorded and outstanding balance added to Debtor Management."
                : "Sale recorded successfully.",
            sale: {
                id: saleId,
                sale_number: saleNumber,
                sale_date: saleDate,
                customer_id: customerId,
                customer_name: customer?.full_name || null,
                subtotal,
                discount_amount: requestedDiscount,
                total_amount: totalAmount,
                amount_paid: amountPaid,
                balance_due: balanceDue,
                payment_status: paymentStatus,
                status: "completed",
                debtor_transaction_id: debtorTransactionId
            }
        });
    } catch (error) {
        if (transactionStarted) {
            await rollbackTransaction();
        }

        if (error.message === "CUSTOMER_NOT_FOUND") {
            return sendError(
                res,
                "The selected customer does not belong to this business.",
                404
            );
        }

        if (error.message === "CUSTOMER_REQUIRED_FOR_CREDIT") {
            return sendError(
                res,
                "Select or register a customer before completing a sale with an unpaid balance.",
                400
            );
        }

        if (error.message === "CUSTOMER_CREDIT_DISABLED") {
            return sendError(
                res,
                "Credit is disabled for this customer. Enable credit in Debtor Management or collect full payment.",
                400
            );
        }

        if (error.message === "CREDIT_LIMIT_EXCEEDED") {
            return sendError(
                res,
                "This sale would exceed the customer's credit limit.",
                409
            );
        }

        if (error.message === "DAILY_NOTEBOOK_CLOSED") {
            return sendError(
                res,
                "Today's debtor notebook is closed. This credit sale cannot be added.",
                409
            );
        }

        if (error.message === "MONTHLY_NOTEBOOK_CLOSED") {
            return sendError(
                res,
                "This month's debtor notebook is closed. This credit sale cannot be added.",
                409
            );
        }

        if (error.message === "PRODUCT_NOT_FOUND") {
            return sendError(
                res,
                "One or more selected products could not be found.",
                404
            );
        }

        if (error.message === "INVALID_PRODUCT_PRICE") {
            return sendError(
                res,
                "A product has an invalid selling price or buying price.",
                409
            );
        }

        if (error.message.startsWith("INSUFFICIENT_STOCK:")) {
            const productName = error.message
                .split(":")
                .slice(1)
                .join(":");

            return sendError(
                res,
                `Not enough stock available for ${productName}.`,
                409
            );
        }

        if (error.message === "DISCOUNT_EXCEEDS_SUBTOTAL") {
            return sendError(
                res,
                "The discount cannot exceed the sale subtotal.",
                400
            );
        }

        if (error.message === "PAYMENT_EXCEEDS_TOTAL") {
            return sendError(
                res,
                "The amount paid cannot exceed the sale total.",
                400
            );
        }

        if (error.message === "INVALID_SALE_TOTAL") {
            return sendError(
                res,
                "The sale total must be greater than zero.",
                400
            );
        }

        console.error("Create sale error:", error);

        return sendError(
            res,
            "Unable to record this sale. The transaction was rolled back."
        );
    }
});

module.exports = router;