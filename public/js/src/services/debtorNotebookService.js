
const db = require("../config/database");

function run(sql, params = []) {
    return new Promise((resolve, reject) => {
        db.run(sql, params, function (error) {
            if (error) return reject(error);
            resolve({ lastID: this.lastID, changes: this.changes });
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

function kenyaDateParts(date = new Date()) {
    const parts = new Intl.DateTimeFormat("en-GB", {
        timeZone: "Africa/Nairobi",
        year: "numeric",
        month: "2-digit",
        day: "2-digit"
    }).formatToParts(date);

    const values = {};

    for (const part of parts) {
        if (part.type !== "literal") {
            values[part.type] = part.value;
        }
    }

    return {
        date: `${values.year}-${values.month}-${values.day}`,
        year: Number(values.year),
        month: Number(values.month)
    };
}

function addDays(dateString, amount) {
    const [year, month, day] = dateString.split("-").map(Number);
    const date = new Date(Date.UTC(year, month - 1, day + amount));

    return [
        date.getUTCFullYear(),
        String(date.getUTCMonth() + 1).padStart(2, "0"),
        String(date.getUTCDate()).padStart(2, "0")
    ].join("-");
}

function addMonths(year, month, amount) {
    const date = new Date(Date.UTC(year, month - 1 + amount, 1));

    return {
        year: date.getUTCFullYear(),
        month: date.getUTCMonth() + 1
    };
}

function roundMoney(value) {
    return Number((Number(value) || 0).toFixed(2));
}

function signedBalance(debt, payments) {
    return roundMoney(Number(debt || 0) - Number(payments || 0));
}

function getMonthStart(year, month) {
    return `${year}-${String(month).padStart(2, "0")}-01`;
}

function getNextMonthStart(year, month) {
    const next = addMonths(year, month, 1);
    return getMonthStart(next.year, next.month);
}

async function getCustomerIds(businessId) {
    return all(
        `SELECT id
         FROM customers
         WHERE business_id = ?
         ORDER BY id`,
        [businessId]
    );
}

async function getFirstActivityDate(businessId, customerId) {
    const row = await get(
        `SELECT MIN(activity_date) AS first_date
         FROM (
             SELECT transaction_date AS activity_date
             FROM debtor_transactions
             WHERE business_id = ? AND customer_id = ?

             UNION ALL

             SELECT payment_date AS activity_date
             FROM debtor_payments
             WHERE business_id = ? AND customer_id = ?
         )`,
        [businessId, customerId, businessId, customerId]
    );

    return row?.first_date || null;
}

async function getTotalsBetween(
    businessId,
    customerId,
    startDate,
    endDate
) {
    const totals = await get(
        `SELECT
            COALESCE((
                SELECT SUM(total_amount)
                FROM debtor_transactions
                WHERE business_id = ?
                  AND customer_id = ?
                  AND transaction_date >= ?
                  AND transaction_date < ?
            ), 0) AS debt_added,

            COALESCE((
                SELECT SUM(amount)
                FROM debtor_payments
                WHERE business_id = ?
                  AND customer_id = ?
                  AND payment_date >= ?
                  AND payment_date < ?
            ), 0) AS payments_received`,
        [
            businessId,
            customerId,
            startDate,
            endDate,
            businessId,
            customerId,
            startDate,
            endDate
        ]
    );

    return {
        debtAdded: roundMoney(totals?.debt_added),
        paymentsReceived: roundMoney(totals?.payments_received)
    };
}

async function getBalanceBefore(
    businessId,
    customerId,
    beforeDate
) {
    const totals = await get(
        `SELECT
            COALESCE((
                SELECT SUM(total_amount)
                FROM debtor_transactions
                WHERE business_id = ?
                  AND customer_id = ?
                  AND transaction_date < ?
            ), 0) AS total_debt,

            COALESCE((
                SELECT SUM(amount)
                FROM debtor_payments
                WHERE business_id = ?
                  AND customer_id = ?
                  AND payment_date < ?
            ), 0) AS total_paid`,
        [
            businessId,
            customerId,
            beforeDate,
            businessId,
            customerId,
            beforeDate
        ]
    );

    return signedBalance(
        totals?.total_debt,
        totals?.total_paid
    );
}

async function saveDailyNotebook(
    businessId,
    customerId,
    date,
    today
) {
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

    const closingBalance = signedBalance(
        openingBalance + totals.debtAdded,
        totals.paymentsReceived
    );

    const status = date < today ? "closed" : "open";

    await run(
        `INSERT INTO debtor_daily_notebooks (
            business_id,
            customer_id,
            notebook_date,
            opening_balance,
            debt_added,
            payments_received,
            closing_balance,
            status,
            closed_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)

        ON CONFLICT (business_id, customer_id, notebook_date)
        DO UPDATE SET
            opening_balance = excluded.opening_balance,
            debt_added = excluded.debt_added,
            payments_received = excluded.payments_received,
            closing_balance = excluded.closing_balance,
            status = excluded.status,
            closed_at = CASE
                WHEN excluded.status = 'closed'
                THEN COALESCE(
                    debtor_daily_notebooks.closed_at,
                    CURRENT_TIMESTAMP
                )
                ELSE NULL
            END

        WHERE debtor_daily_notebooks.status = 'open'`,
        [
            businessId,
            customerId,
            date,
            openingBalance,
            totals.debtAdded,
            totals.paymentsReceived,
            closingBalance,
            status,
            status === "closed" ? new Date().toISOString() : null
        ]
    );
}

async function saveMonthlyNotebook(
    businessId,
    customerId,
    year,
    month,
    today
) {
    const startDate = getMonthStart(year, month);
    const endDate = getNextMonthStart(year, month);

    const [openingBalance, totals] = await Promise.all([
        getBalanceBefore(businessId, customerId, startDate),
        getTotalsBetween(
            businessId,
            customerId,
            startDate,
            endDate
        )
    ]);

    const currentMonth =
        year === today.year &&
        month === today.month;

    const closingBalance = signedBalance(
        openingBalance + totals.debtAdded,
        totals.paymentsReceived
    );

    const status = currentMonth ? "open" : "closed";

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
            status,
            closed_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)

        ON CONFLICT (business_id, customer_id, year, month)
        DO UPDATE SET
            opening_balance = excluded.opening_balance,
            debt_added = excluded.debt_added,
            payments_received = excluded.payments_received,
            closing_balance = excluded.closing_balance,
            status = excluded.status,
            closed_at = CASE
                WHEN excluded.status = 'closed'
                THEN COALESCE(
                    debtor_monthly_notebooks.closed_at,
                    CURRENT_TIMESTAMP
                )
                ELSE NULL
            END

        WHERE debtor_monthly_notebooks.status = 'open'`,
        [
            businessId,
            customerId,
            year,
            month,
            openingBalance,
            totals.debtAdded,
            totals.paymentsReceived,
            closingBalance,
            status,
            status === "closed" ? new Date().toISOString() : null
        ]
    );
}

async function rebuildCustomerNotebooks(
    businessId,
    customerId,
    today
) {
    const firstDate = await getFirstActivityDate(
        businessId,
        customerId
    );

    // Include transaction dates, payment dates, previously
    // created daily notebooks, and today's date.
    // This ensures old empty notebooks are also closed.
    const dailyDates = await all(
        `SELECT transaction_date AS notebook_date
         FROM debtor_transactions
         WHERE business_id = ? AND customer_id = ?

         UNION

         SELECT payment_date AS notebook_date
         FROM debtor_payments
         WHERE business_id = ? AND customer_id = ?

         UNION

         SELECT notebook_date
         FROM debtor_daily_notebooks
         WHERE business_id = ? AND customer_id = ?

         ORDER BY notebook_date`,
        [
            businessId,
            customerId,
            businessId,
            customerId,
            businessId,
            customerId
        ]
    );

    const dates = new Set(
        dailyDates.map(row => row.notebook_date)
    );

    dates.add(today.date);

    for (const date of [...dates].sort()) {
        await saveDailyNotebook(
            businessId,
            customerId,
            date,
            today.date
        );
    }

    // Customers without credit activity still get their daily
    // notebooks processed, but monthly history starts when
    // their first credit activity occurs.
    if (!firstDate) return;

    const [firstYear, firstMonth] = firstDate
        .split("-")
        .slice(0, 2)
        .map(Number);

    let period = {
        year: firstYear,
        month: firstMonth
    };

    while (
        period.year < today.year ||
        (
            period.year === today.year &&
            period.month <= today.month
        )
    ) {
        await saveMonthlyNotebook(
            businessId,
            customerId,
            period.year,
            period.month,
            today
        );

        period = addMonths(
            period.year,
            period.month,
            1
        );
    }
}

async function ensureBusinessNotebooks(businessId) {
    const id = Number(businessId);

    if (!Number.isInteger(id) || id <= 0) {
        throw new Error("A valid business ID is required.");
    }

    const today = kenyaDateParts();
    const customers = await getCustomerIds(id);

    for (const customer of customers) {
        await rebuildCustomerNotebooks(
            id,
            customer.id,
            today
        );
    }

    return {
        success: true,
        processed_customers: customers.length,
        today: today.date
    };
}

async function ensureCustomerNotebooks(businessId, customerId) {
    const business = Number(businessId);
    const customer = Number(customerId);

    if (
        !Number.isInteger(business) ||
        business <= 0 ||
        !Number.isInteger(customer) ||
        customer <= 0
    ) {
        throw new Error(
            "Valid business and customer IDs are required."
        );
    }

    const today = kenyaDateParts();

    await rebuildCustomerNotebooks(
        business,
        customer,
        today
    );

    return {
        success: true,
        today: today.date
    };
}

module.exports = {
    ensureBusinessNotebooks,
    ensureCustomerNotebooks,
    kenyaDateParts,
    addDays,
    addMonths,
    getMonthStart,
    getNextMonthStart,
    getTotalsBetween,
    getBalanceBefore
};
