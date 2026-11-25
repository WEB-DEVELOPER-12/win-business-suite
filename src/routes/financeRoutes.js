
const express = require("express");

const pool = require("../config/postgresDatabase");
const requireAuth = require("../middleware/requireAuth");
const { kenyaDateParts } = require("../services/debtorNotebookService");

const router = express.Router();

router.use(requireAuth);

const PAYMENT_METHODS = [
    "cash",
    "mpesa",
    "bank_transfer",
    "other"
];

const EXPENSE_CATEGORIES = [
    "Food",
    "Transport",
    "Utilities",
    "Supplies",
    "Rent",
    "Electricity",
    "Water",
    "Internet",
    "Salaries",
    "Repairs & Maintenance",
    "Marketing",
    "Office Supplies",
    "Bank Charges",
    "Other"
];

const INCOME_CATEGORIES = [
    "Interest Income",
    "Rental Income",
    "Commission",
    "Service Income",
    "Investment Income",
    "Other"
];

async function run(sql, params = []) {
    const result = await pool.query(sql, params);

    return {
        lastID: result.rows[0]?.id ?? null,
        changes: result.rowCount
    };
}

async function get(sql, params = []) {
    const result = await pool.query(sql, params);
    return result.rows[0] || null;
}

async function all(sql, params = []) {
    const result = await pool.query(sql, params);
    return result.rows;
}

function roundMoney(value) {
    return Math.round(
        (Number(value || 0) + Number.EPSILON) * 100
    ) / 100;
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

    return Number.isFinite(amount) && amount > 0
        ? roundMoney(amount)
        : null;
}

function getBusinessId(req) {
    return Number(req.session.user.business_id);
}

function getUserId(req) {
    return Number(req.session.user.id);
}

function sendError(res, message, status = 500) {
    return res.status(status).json({
        success: false,
        message
    });
}

function isValidDate(value) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
        return false;
    }

    const date = new Date(`${value}T00:00:00.000Z`);

    return !Number.isNaN(date.getTime()) &&
        date.toISOString().slice(0, 10) === value;
}

function getTable(type) {
    if (type === "expense") {
        return "finance_expenses";
    }

    if (type === "income") {
        return "finance_other_income";
    }

    return null;
}

function getCategories(type) {
    if (type === "expense") {
        return EXPENSE_CATEGORIES;
    }

    if (type === "income") {
        return INCOME_CATEGORIES;
    }

    return null;
}

async function resolveCategory(type, selected, customCategory, businessId) {
    const predefined = getCategories(type);

    if (!predefined) {
        return null;
    }

    const category = cleanText(selected, 100);

    if (!category) {
        return null;
    }

    if (category.toLowerCase() === "other") {
        const custom = cleanText(customCategory, 100);

        if (
            !custom ||
            custom.toLowerCase() === "other"
        ) {
            return null;
        }

        return custom;
    }

    const fixedMatch = predefined.find(
        item => item.toLowerCase() === category.toLowerCase()
    );

    if (fixedMatch) {
        return fixedMatch;
    }

    const table = getTable(type);

    const existing = await get(
        `SELECT category
         FROM ${table}
         WHERE business_id = $1
           AND LOWER(category) = LOWER($2)
         LIMIT 1`,
        [businessId, category]
    );

    return existing ? existing.category : null;
}

function validateDateRange(startDate, endDate) {
    return isValidDate(startDate) &&
        isValidDate(endDate) &&
        startDate <= endDate;
}

function getDateRange(req) {
    const today = kenyaDateParts().date;

    const startDate = cleanText(
        req.query.start_date || today,
        10
    );

    const endDate = cleanText(
        req.query.end_date || today,
        10
    );

    if (!validateDateRange(startDate, endDate)) {
        return null;
    }

    return { startDate, endDate };
}

function normalizeRecord(body) {
    const amount = validAmount(body.amount);

    const transactionDate = cleanText(
        body.transaction_date,
        10
    );

    const paymentMethod = cleanText(
        body.payment_method || "cash",
        30
    ).toLowerCase();

    const description = cleanText(
        body.description,
        250
    );

    const reference = cleanText(
        body.reference,
        100
    );

    const notes = cleanText(
        body.notes,
        1000
    );

    if (amount === null) {
        return {
            error: "Enter an amount greater than zero."
        };
    }

    if (!isValidDate(transactionDate)) {
        return {
            error: "Enter a valid transaction date."
        };
    }

    if (!PAYMENT_METHODS.includes(paymentMethod)) {
        return {
            error: "Select a valid payment method."
        };
    }

    if (!description) {
        return {
            error: "Enter a transaction description."
        };
    }

    return {
        amount,
        transactionDate,
        paymentMethod,
        description,
        reference,
        notes
    };
}

// GET /api/finance/categories?type=expense|income

router.get("/categories", async (req, res) => {
    try {
        const businessId = getBusinessId(req);
        const type = cleanText(req.query.type, 20).toLowerCase();

        const predefined = getCategories(type);
        const table = getTable(type);

        if (!predefined || !table) {
            return sendError(
                res,
                "Select expense or income as the category type.",
                400
            );
        }

        const customRows = await all(
            `SELECT DISTINCT category
             FROM ${table}
             WHERE business_id = $1
             ORDER BY category`,
            [businessId]
        );

        const customCategories = customRows
            .map(row => row.category)
            .filter(category =>
                !predefined.some(
                    item => item.toLowerCase() === category.toLowerCase()
                )
            );

        return res.json({
            success: true,
            type,
            predefined,
            custom: customCategories
        });
    } catch (error) {
        console.error("Finance categories error:", error);

        return sendError(
            res,
            "Unable to load Finance categories."
        );
    }
});

// GET /api/finance/summary

router.get("/summary", async (req, res) => {
    try {
        const businessId = getBusinessId(req);
        const range = getDateRange(req);

        if (!range) {
            return sendError(res, "Invalid date range.", 400);
        }

        const { startDate, endDate } = range;

        const sales = await get(
            `SELECT
                COUNT(*) AS total_sales,
                COALESCE(SUM(total_amount), 0) AS total_revenue
             FROM sales
             WHERE business_id = $1
               AND sale_date::date >= $2::date
               AND sale_date::date <= $3::date
               AND status = 'completed'`,
            [businessId, startDate, endDate]
        );

        const profit = await get(
            `SELECT
                COALESCE(SUM(
                    si.line_total -
                    (si.quantity * COALESCE(si.unit_cost, 0))
                ), 0) AS gross_profit,

                COALESCE(SUM(
                    si.quantity * COALESCE(si.unit_cost, 0)
                ), 0) AS cost_of_goods

             FROM sale_items si
             INNER JOIN sales s ON s.id = si.sale_id
             WHERE s.business_id = $1
               AND s.sale_date::date >= $2::date
               AND s.sale_date::date <= $3::date
               AND s.status = 'completed'`,
            [businessId, startDate, endDate]
        );

        const expenses = await get(
            `SELECT
                COUNT(*) AS total_records,
                COALESCE(SUM(amount), 0) AS total
             FROM finance_expenses
             WHERE business_id = $1
               AND transaction_date >= $2
               AND transaction_date <= $3
               AND status = 'active'`,
            [businessId, startDate, endDate]
        );

        const income = await get(
            `SELECT
                COUNT(*) AS total_records,
                COALESCE(SUM(amount), 0) AS total
             FROM finance_other_income
             WHERE business_id = $1
               AND transaction_date >= $2
               AND transaction_date <= $3
               AND status = 'active'`,
            [businessId, startDate, endDate]
        );

        const netProfit = roundMoney(
            Number(profit.gross_profit || 0) +
            Number(income.total || 0) -
            Number(expenses.total || 0)
        );

        return res.json({
            success: true,
            period: {
                start_date: startDate,
                end_date: endDate
            },
            summary: {
                total_sales: Number(sales.total_sales || 0),
                sales_revenue: roundMoney(sales.total_revenue),
                cost_of_goods: roundMoney(profit.cost_of_goods),
                gross_profit: roundMoney(profit.gross_profit),
                other_income: roundMoney(income.total),
                other_income_records: Number(income.total_records || 0),
                expenses: roundMoney(expenses.total),
                expense_records: Number(expenses.total_records || 0),
                net_profit: netProfit
            }
        });
    } catch (error) {
        console.error("Finance summary error:", error);

        return sendError(
            res,
            "Unable to load Finance summary."
        );
    }
});

// GET /api/finance/profit-loss

router.get("/profit-loss", async (req, res) => {
    try {
        const businessId = getBusinessId(req);
        const range = getDateRange(req);

        if (!range) {
            return sendError(res, "Invalid date range.", 400);
        }

        const { startDate, endDate } = range;

        const sales = await get(
            `SELECT
                COALESCE(SUM(s.total_amount), 0) AS revenue,
                COALESCE((
                    SELECT SUM(
                        si.quantity * COALESCE(si.unit_cost, 0)
                    )
                    FROM sale_items si
                    INNER JOIN sales linked
                        ON linked.id = si.sale_id
                    WHERE linked.business_id = $1
                      AND linked.sale_date::date >= $2::date
                      AND linked.sale_date::date <= $3::date
                      AND linked.status = 'completed'
                ), 0) AS cost_of_goods,
                COALESCE((
                    SELECT SUM(
                        si.line_total -
                        (si.quantity * COALESCE(si.unit_cost, 0))
                    )
                    FROM sale_items si
                    INNER JOIN sales linked
                        ON linked.id = si.sale_id
                    WHERE linked.business_id = $4
                      AND linked.sale_date::date >= $5::date
                      AND linked.sale_date::date <= $6::date
                      AND linked.status = 'completed'
                ), 0) AS gross_profit
             FROM sales s
             WHERE s.business_id = $7
               AND s.sale_date::date >= $8::date
               AND s.sale_date::date <= $9::date
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

        const income = await get(
            `SELECT COALESCE(SUM(amount), 0) AS total
             FROM finance_other_income
             WHERE business_id = $1
               AND transaction_date >= $2
               AND transaction_date <= $3
               AND status = 'active'`,
            [businessId, startDate, endDate]
        );

        const expenses = await get(
            `SELECT COALESCE(SUM(amount), 0) AS total
             FROM finance_expenses
             WHERE business_id = $1
               AND transaction_date >= $2
               AND transaction_date <= $3
               AND status = 'active'`,
            [businessId, startDate, endDate]
        );

        const grossProfit = roundMoney(sales.gross_profit);
        const otherIncome = roundMoney(income.total);
        const totalExpenses = roundMoney(expenses.total);

        return res.json({
            success: true,
            period: {
                start_date: startDate,
                end_date: endDate
            },
            report: {
                sales_revenue: roundMoney(sales.revenue),
                cost_of_goods: roundMoney(sales.cost_of_goods),
                gross_profit: grossProfit,
                other_income: otherIncome,
                total_income: roundMoney(
                    grossProfit + otherIncome
                ),
                expenses: totalExpenses,
                net_profit: roundMoney(
                    grossProfit + otherIncome - totalExpenses
                )
            }
        });
    } catch (error) {
        console.error("Finance profit and loss error:", error);

        return sendError(
            res,
            "Unable to generate the Profit & Loss report."
        );
    }
});

// GET /api/finance/transactions

router.get("/transactions", async (req, res) => {
    try {
        const businessId = getBusinessId(req);

        const page = Math.max(
            1,
            Number.parseInt(req.query.page, 10) || 1
        );

        const limit = Math.min(
            100,
            Math.max(
                1,
                Number.parseInt(req.query.limit, 10) || 25
            )
        );

        const offset = (page - 1) * limit;

        const range = getDateRange(req);

        if (!range) {
            return sendError(res, "Invalid date range.", 400);
        }

        const status = cleanText(
            req.query.status || "all",
            20
        ).toLowerCase();

        if (!["all", "active", "voided"].includes(status)) {
            return sendError(res, "Invalid transaction status.", 400);
        }

        const search = cleanText(req.query.search, 100);
        const { startDate, endDate } = range;

        const conditions = [
            "transaction_date >= $1",
            "transaction_date <= $2"
        ];

        const params = [startDate, endDate];

        if (status !== "all") {
            params.push(status);
            conditions.push(`status = $${params.length}`);
        }

        if (search) {
            params.push(`%${search}%`);
            const position = params.length;

            conditions.push(
                `(description ILIKE $${position} OR category ILIKE $${position} OR reference ILIKE $${position})`
            );
        }

        const where = conditions.join(" AND ");

        const transactions = await all(
            `SELECT *
             FROM (
                SELECT
                    id,
                    'expense' AS type,
                    category,
                    description,
                    amount,
                    transaction_date,
                    payment_method,
                    reference,
                    notes,
                    status,
                    void_reason,
                    voided_at,
                    created_at
                FROM finance_expenses
                WHERE business_id = $${params.length + 1}

                UNION ALL

                SELECT
                    id,
                    'income' AS type,
                    category,
                    description,
                    amount,
                    transaction_date,
                    payment_method,
                    reference,
                    notes,
                    status,
                    void_reason,
                    voided_at,
                    created_at
                FROM finance_other_income
                WHERE business_id = $${params.length + 1}
             ) AS combined_transactions
             WHERE ${where}
             ORDER BY transaction_date DESC, id DESC
             LIMIT $${params.length + 2}
             OFFSET $${params.length + 3}`,
            [
                ...params,
                businessId,
                limit,
                offset
            ]
        );

        const count = await get(
            `SELECT COUNT(*) AS total
             FROM (
                SELECT
                    id,
                    category,
                    description,
                    amount,
                    transaction_date,
                    payment_method,
                    reference,
                    notes,
                    status
                FROM finance_expenses
                WHERE business_id = $${params.length + 1}

                UNION ALL

                SELECT
                    id,
                    category,
                    description,
                    amount,
                    transaction_date,
                    payment_method,
                    reference,
                    notes,
                    status
                FROM finance_other_income
                WHERE business_id = $${params.length + 1}
             ) AS combined_transactions
             WHERE ${where}`,
            [
                ...params,
                businessId
            ]
        );

        return res.json({
            success: true,
            transactions,
            pagination: {
                page,
                limit,
                total: Number(count.total || 0),
                total_pages: Math.ceil(
                    Number(count.total || 0) / limit
                )
            }
        });
    } catch (error) {
        console.error("Finance transactions error:", error);

        return sendError(
            res,
            "Unable to load Finance transactions."
        );
    }
});

// Shared expense and income route handlers.

function registerRecordRoutes(type) {
    const table = getTable(type);
    const label = type === "expense" ? "Expense" : "Income";
    const routeName = type === "expense" ? "expenses" : "income";

    // GET /api/finance/expenses or /income
    router.get(`/${routeName}`, async (req, res) => {
        try {
            const businessId = getBusinessId(req);

            const page = Math.max(
                1,
                Number.parseInt(req.query.page, 10) || 1
            );

            const limit = Math.min(
                100,
                Math.max(
                    1,
                    Number.parseInt(req.query.limit, 10) || 25
                )
            );

            const offset = (page - 1) * limit;
            const range = getDateRange(req);

            if (!range) {
                return sendError(res, "Invalid date range.", 400);
            }

            const status = cleanText(
                req.query.status || "active",
                20
            ).toLowerCase();

            if (!["all", "active", "voided"].includes(status)) {
                return sendError(res, "Invalid record status.", 400);
            }

            const conditions = [
                "business_id = $1",
                "transaction_date >= $2",
                "transaction_date <= $3"
            ];

            const params = [
                businessId,
                range.startDate,
                range.endDate
            ];

            if (status !== "all") {
                params.push(status);
                conditions.push(`status = $${params.length}`);
            }

            const search = cleanText(req.query.search, 100);

            if (search) {
                params.push(`%${search}%`);
                const position = params.length;

                conditions.push(
                    `(description ILIKE $${position} OR category ILIKE $${position} OR reference ILIKE $${position})`
                );
            }

            const where = conditions.join(" AND ");

            const count = await get(
                `SELECT COUNT(*) AS total
                 FROM ${table}
                 WHERE ${where}`,
                params
            );

            const records = await all(
                `SELECT *
                 FROM ${table}
                 WHERE ${where}
                 ORDER BY transaction_date DESC, id DESC
                 LIMIT $${params.length + 1}
                 OFFSET $${params.length + 2}`,
                [...params, limit, offset]
            );

            return res.json({
                success: true,
                type,
                records,
                pagination: {
                    page,
                    limit,
                    total: Number(count.total || 0),
                    total_pages: Math.ceil(
                        Number(count.total || 0) / limit
                    )
                }
            });
        } catch (error) {
            console.error(`${label} list error:`, error);

            return sendError(
                res,
                `Unable to load ${label.toLowerCase()} records.`
            );
        }
    });

    // POST /api/finance/expenses or /income
    router.post(`/${routeName}`, async (req, res) => {
        try {
            const businessId = getBusinessId(req);
            const userId = getUserId(req);

            const record = normalizeRecord(req.body);

            if (record.error) {
                return sendError(res, record.error, 400);
            }

            const category = await resolveCategory(
                type,
                req.body.category,
                req.body.custom_category,
                businessId
            );

            if (!category) {
                return sendError(
                    res,
                    "Select a valid category. If you choose Other, enter its name.",
                    400
                );
            }

            const result = await run(
                `INSERT INTO ${table} (
                    business_id,
                    category,
                    description,
                    amount,
                    transaction_date,
                    payment_method,
                    reference,
                    notes,
                    created_by,
                    updated_by
                )
                VALUES (
                    $1, $2, $3, $4, $5,
                    $6, $7, $8, $9, $10
                )
                RETURNING id`,
                [
                    businessId,
                    category,
                    record.description,
                    record.amount,
                    record.transactionDate,
                    record.paymentMethod,
                    record.reference,
                    record.notes,
                    userId,
                    userId
                ]
            );

            const saved = await get(
                `SELECT *
                 FROM ${table}
                 WHERE id = $1
                   AND business_id = $2`,
                [result.lastID, businessId]
            );

            return res.status(201).json({
                success: true,
                message: `${label} recorded successfully.`,
                record: saved
            });
        } catch (error) {
            console.error(`${label} creation error:`, error);

            return sendError(
                res,
                `Unable to record this ${label.toLowerCase()}.`
            );
        }
    });

    // GET /api/finance/expenses/:id or /income/:id
    router.get(`/${routeName}/:id`, async (req, res) => {
        try {
            const businessId = getBusinessId(req);
            const id = validId(req.params.id);

            if (!id) {
                return sendError(res, "Invalid record ID.", 400);
            }

            const record = await get(
                `SELECT *
                 FROM ${table}
                 WHERE id = $1
                   AND business_id = $2`,
                [id, businessId]
            );

            if (!record) {
                return sendError(
                    res,
                    `${label} record not found.`,
                    404
                );
            }

            return res.json({
                success: true,
                record
            });
        } catch (error) {
            console.error(`${label} details error:`, error);

            return sendError(
                res,
                `Unable to load ${label.toLowerCase()} details.`
            );
        }
    });

    // PUT /api/finance/expenses/:id or income/:id
    router.put(`/${routeName}/:id`, async (req, res) => {
        try {
            const businessId = getBusinessId(req);
            const userId = getUserId(req);
            const id = validId(req.params.id);

            if (!id) {
                return sendError(res, "Invalid record ID.", 400);
            }

            const existing = await get(
                `SELECT id, status
                 FROM ${table}
                 WHERE id = $1
                   AND business_id = $2`,
                [id, businessId]
            );

            if (!existing) {
                return sendError(
                    res,
                    `${label} record not found.`,
                    404
                );
            }

            if (existing.status !== "active") {
                return sendError(
                    res,
                    "Voided records cannot be edited.",
                    409
                );
            }

            const record = normalizeRecord(req.body);

            if (record.error) {
                return sendError(res, record.error, 400);
            }

            const category = await resolveCategory(
                type,
                req.body.category,
                req.body.custom_category,
                businessId
            );

            if (!category) {
                return sendError(
                    res,
                    "Select a valid category. If you choose Other, enter its name.",
                    400
                );
            }

            await run(
                `UPDATE ${table}
                 SET
                    category = $1,
                    description = $2,
                    amount = $3,
                    transaction_date = $4,
                    payment_method = $5,
                    reference = $6,
                    notes = $7,
                    updated_by = $8,
                    updated_at = CURRENT_TIMESTAMP
                 WHERE id = $9
                   AND business_id = $10
                   AND status = 'active'`,
                [
                    category,
                    record.description,
                    record.amount,
                    record.transactionDate,
                    record.paymentMethod,
                    record.reference,
                    record.notes,
                    userId,
                    id,
                    businessId
                ]
            );

            const updated = await get(
                `SELECT *
                 FROM ${table}
                 WHERE id = $1
                   AND business_id = $2`,
                [id, businessId]
            );

            return res.json({
                success: true,
                message: `${label} updated successfully.`,
                record: updated
            });
        } catch (error) {
            console.error(`${label} update error:`, error);

            return sendError(
                res,
                `Unable to update this ${label.toLowerCase()}.`
            );
        }
    });

    // POST /api/finance/expenses/:id/void or income/:id/void
    router.post(`/${routeName}/:id/void`, async (req, res) => {
        try {
            const businessId = getBusinessId(req);
            const userId = getUserId(req);
            const id = validId(req.params.id);
            const reason = cleanText(req.body.reason, 500);

            if (!id) {
                return sendError(res, "Invalid record ID.", 400);
            }

            if (!reason) {
                return sendError(
                    res,
                    "Enter a reason for voiding this record.",
                    400
                );
            }

            const existing = await get(
                `SELECT id, status
                 FROM ${table}
                 WHERE id = $1
                   AND business_id = $2`,
                [id, businessId]
            );

            if (!existing) {
                return sendError(
                    res,
                    `${label} record not found.`,
                    404
                );
            }

            if (existing.status === "voided") {
                return sendError(
                    res,
                    "This record has already been voided.",
                    409
                );
            }

            await run(
                `UPDATE ${table}
                 SET
                    status = 'voided',
                    voided_by = $1,
                    voided_at = CURRENT_TIMESTAMP,
                    void_reason = $2,
                    updated_by = $3,
                    updated_at = CURRENT_TIMESTAMP
                 WHERE id = $4
                   AND business_id = $5
                   AND status = 'active'`,
                [
                    userId,
                    reason,
                    userId,
                    id,
                    businessId
                ]
            );

            const voided = await get(
                `SELECT *
                 FROM ${table}
                 WHERE id = $1
                   AND business_id = $2`,
                [id, businessId]
            );

            return res.json({
                success: true,
                message: `${label} voided successfully. It remains in your financial history.`,
                record: voided
            });
        } catch (error) {
            console.error(`${label} void error:`, error);

            return sendError(
                res,
                `Unable to void this ${label.toLowerCase()}.`
            );
        }
    });
}

registerRecordRoutes("expense");
registerRecordRoutes("income");

module.exports = router;
