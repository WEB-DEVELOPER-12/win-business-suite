
"use strict";

const API_BASE = "/api/debtors";

const params = new URLSearchParams(window.location.search);
const debtorId = Number(params.get("id"));

let currentDebtor = null;
let transactions = [];
let payments = [];
let inventoryProducts = [];
let activeTab = "all";
let selectedDailyDate = "";
let currencyCode = "KES";

let notebookRequestNumber = 0;
let creditSaving = false;
let paymentSaving = false;

const elements = {
    userName: document.getElementById("userName"),
    logoutButton: document.getElementById("logoutButton"),

    customerName: document.getElementById("customerName"),
    customerPhone: document.getElementById("customerPhone"),
    customerEmail: document.getElementById("customerEmail"),
    customerAddress: document.getElementById("customerAddress"),
    customerCreditStatus: document.getElementById("customerCreditStatus"),

    totalDebt: document.getElementById("customerTotalDebt"),
    totalPaid: document.getElementById("customerTotalPaid"),
    balance: document.getElementById("customerBalance"),
    customerCredit: document.getElementById("customerCredit"),
    availableCredit: document.getElementById("customerAvailableCredit"),

    recordsBody: document.getElementById("customerRecordsBody"),
    notebookMessage: document.getElementById("notebookMessage"),

    whatsappButton: document.getElementById("whatsappStatementButton"),

    allTab: document.getElementById("allRecordsTab"),
    dailyTab: document.getElementById("dailyRecordsTab"),
    monthlyTab: document.getElementById("monthlyRecordsTab"),
    yearlyTab: document.getElementById("yearlyRecordsTab"),

    dailyDateControls: document.getElementById("dailyDateControls"),
    dailyNotebookDate: document.getElementById("dailyNotebookDate"),

    creditForm: document.getElementById("creditTransactionForm"),
    productsContainer: document.getElementById("creditProductsContainer"),
    addProductButton: document.getElementById("addCreditProductButton"),
    creditNotes: document.getElementById("creditTransactionNotes"),
    creditMessage: document.getElementById("creditTransactionMessage"),
    creditTotal: document.getElementById("creditTransactionTotal"),
    saveCreditButton: document.getElementById("saveCreditTransactionButton"),

    paymentForm: document.getElementById("paymentForm"),
    paymentAmount: document.getElementById("paymentAmount"),
    paymentMethod: document.getElementById("paymentMethod"),
    paymentDate: document.getElementById("paymentDate"),
    paymentReference: document.getElementById("paymentReference"),
    paymentNotes: document.getElementById("paymentNotes"),
    paymentMessage: document.getElementById("paymentMessage"),
    savePaymentButton: document.getElementById("savePaymentButton"),

    paymentHistoryTotal: document.getElementById("paymentHistoryTotal"),
    paymentHistoryBalance: document.getElementById("paymentHistoryBalance")
};

// GENERAL HELPERS

function roundMoney(value) {
    const number = Number(value);

    if (!Number.isFinite(number)) {
        return 0;
    }

    return Math.round((number + Number.EPSILON) * 100) / 100;
}

function formatMoney(value) {
    const amount = roundMoney(value);

    try {
        return new Intl.NumberFormat("en-KE", {
            style: "currency",
            currency: currencyCode,
            minimumFractionDigits: 2,
            maximumFractionDigits: 2
        }).format(amount);
    } catch {
        return `${currencyCode} ${amount.toFixed(2)}`;
    }
}

function escapeHTML(value) {
    return String(value ?? "").replace(/[&<>"']/g, character => {
        const replacements = {
            "&": "&amp;",
            "<": "&lt;",
            ">": "&gt;",
            '"': "&quot;",
            "'": "&#039;"
        };

        return replacements[character];
    });
}

function getNairobiDate() {
    const parts = new Intl.DateTimeFormat("en-GB", {
        timeZone: "Africa/Nairobi",
        year: "numeric",
        month: "2-digit",
        day: "2-digit"
    }).formatToParts(new Date());

    const values = {};

    for (const part of parts) {
        if (part.type !== "literal") {
            values[part.type] = part.value;
        }
    }

    return `${values.year}-${values.month}-${values.day}`;
}

function formatDate(dateValue) {
    if (!dateValue) return "--";

    const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(
        String(dateValue)
    );

    if (!match) {
        return escapeHTML(dateValue);
    }

    return `${match[3]}/${match[2]}/${match[1]}`;
}

function showMessage(message, type = "error") {
    const element = elements.notebookMessage;

    if (!element) return;

    element.textContent = message;
    element.className = "message-box";

    if (type === "success") {
        element.classList.add("message-success");
    } else if (type === "error") {
        element.classList.add("message-error");
    }
}

function clearMessage() {
    const element = elements.notebookMessage;

    if (!element) return;

    element.textContent = "";
    element.className = "message-box";
}

function showFormMessage(element, message, type = "error") {
    if (!element) return;

    element.textContent = message;
    element.className = "message-box";

    if (type === "success") {
        element.classList.add("message-success");
    } else if (type === "error") {
        element.classList.add("message-error");
    }
}

async function apiRequest(url, options = {}) {
    const response = await fetch(url, {
        credentials: "same-origin",
        ...options,
        headers: {
            ...(options.body
                ? { "Content-Type": "application/json" }
                : {}),
            ...(options.headers || {})
        }
    });

    let data;

    try {
        data = await response.json();
    } catch {
        throw new Error("The server returned an invalid response.");
    }

    if (response.status === 401) {
        window.location.href = "/login.html";
        throw new Error("Your session has expired. Please log in again.");
    }

    if (!response.ok || data.success === false) {
        throw new Error(data.message || "Something went wrong.");
    }

    return data;
}

function setCurrencyFromAccount(data) {
    const candidates = [
        data?.business?.currency,
        data?.user?.business?.currency,
        data?.user?.business_currency,
        data?.user?.currency,
        data?.data?.business?.currency,
        data?.business_currency,
        data?.currency
    ];

    const selected = candidates.find(value =>
        typeof value === "string" &&
        /^[A-Za-z]{3}$/.test(value.trim())
    );

    if (selected) {
        currencyCode = selected.trim().toUpperCase();
    }
}

// ACCOUNT

async function loadAccount() {
    try {
        const data = await apiRequest("/api/auth/me");

        if (elements.userName) {
            elements.userName.textContent =
                data.user?.full_name ||
                data.full_name ||
                "Account";
        }

        setCurrencyFromAccount(data);

        if (currentDebtor) {
            displayDebtor(currentDebtor);
            renderRecords();
            updateProductRows();
        }
    } catch (error) {
        console.error("Account loading error:", error);
    }
}

async function logout() {
    if (!confirm("Are you sure you want to log out?")) {
        return;
    }

    try {
        await apiRequest("/api/auth/logout", {
            method: "POST"
        });

        window.location.href = "/login.html";
    } catch (error) {
        alert(error.message || "Could not log out. Please try again.");
    }
}

// DATE CONTROLS

function setPaymentDateLimit() {
    if (!elements.paymentDate) return;

    const today = getNairobiDate();

    elements.paymentDate.min = today;
    elements.paymentDate.max = today;
    elements.paymentDate.value = today;
}

function initializeDailyDateSelector() {
    if (!elements.dailyNotebookDate) return;

    const today = getNairobiDate();

    selectedDailyDate = today;
    elements.dailyNotebookDate.max = today;
    elements.dailyNotebookDate.value = today;
}

// CUSTOMER PROFILE

function calculateAvailableCredit(debtor) {
    const limit = Math.max(0, Number(debtor.credit_limit) || 0);
    const balance = Math.max(0, Number(debtor.balance) || 0);

    if (limit <= 0) {
        return "No limit";
    }

    return formatMoney(Math.max(0, roundMoney(limit - balance)));
}

function displayDebtor(debtor) {
    currentDebtor = debtor;

    if (elements.customerName) {
        elements.customerName.textContent =
            debtor.full_name || "Unnamed customer";
    }

    if (elements.customerPhone) {
        elements.customerPhone.textContent =
            `Phone: ${debtor.phone || "Not provided"}`;
    }

    if (elements.customerEmail) {
        elements.customerEmail.textContent =
            `Email: ${debtor.email || "Not provided"}`;
    }

    if (elements.customerAddress) {
        elements.customerAddress.textContent =
            `Address: ${debtor.address || "Not provided"}`;
    }

    const creditEnabled =
        debtor.credit_enabled === true ||
        Number(debtor.credit_enabled) === 1;

    if (elements.customerCreditStatus) {
        elements.customerCreditStatus.textContent =
            `Credit status: ${creditEnabled ? "Enabled" : "Disabled"}`;
    }

    if (elements.totalDebt) {
        elements.totalDebt.textContent = formatMoney(debtor.total_debt);
    }

    if (elements.totalPaid) {
        elements.totalPaid.textContent = formatMoney(debtor.total_paid);
    }

    if (elements.balance) {
        elements.balance.textContent = formatMoney(debtor.balance);
    }

    if (elements.customerCredit) {
        elements.customerCredit.textContent =
            formatMoney(debtor.customer_credit);
    }

    if (elements.availableCredit) {
        elements.availableCredit.textContent =
            calculateAvailableCredit(debtor);
    }

    if (elements.paymentHistoryTotal) {
        elements.paymentHistoryTotal.textContent =
            formatMoney(debtor.total_paid);
    }

    if (elements.paymentHistoryBalance) {
        elements.paymentHistoryBalance.textContent =
            formatMoney(debtor.balance);
    }
}

// NOTEBOOK RECORDS

function createTransactionRecord(transaction) {
    const items = Array.isArray(transaction.items)
        ? transaction.items
        : [];

    const itemDescription = items.map(item => {
        return `${escapeHTML(item.product_name)} × ${escapeHTML(item.quantity)} — ${escapeHTML(formatMoney(item.line_total))}`;
    }).join("<br>");

    const plainDescription = items.map(item => {
        return `${item.product_name} × ${item.quantity} — ${formatMoney(item.line_total)}`;
    }).join(", ");

    return {
        date: transaction.transaction_date,
        type: "Goods taken",
        description:
            itemDescription ||
            escapeHTML(transaction.notes || "Credit transaction"),
        plainDescription:
            plainDescription ||
            transaction.notes ||
            "Credit transaction",
        amount: Number(transaction.total_amount) || 0,
        kind: "transaction"
    };
}

function createPaymentRecord(payment) {
    const methodNames = {
        cash: "Cash",
        mpesa: "M-Pesa",
        bank_transfer: "Bank transfer",
        other: "Other"
    };

    const method = methodNames[payment.payment_method] ||
        payment.payment_method ||
        "Payment";

    const details = [
        escapeHTML(method),
        payment.reference
            ? `Reference: ${escapeHTML(payment.reference)}`
            : "",
        payment.notes
            ? escapeHTML(payment.notes)
            : ""
    ].filter(Boolean).join(" · ");

    const plainDetails = [
        method,
        payment.reference
            ? `Reference: ${payment.reference}`
            : "",
        payment.notes || ""
    ].filter(Boolean).join(" · ");

    return {
        date: payment.payment_date,
        type: "Payment received",
        description: details,
        plainDescription: plainDetails,
        amount: Number(payment.amount) || 0,
        kind: "payment"
    };
}

function getCombinedRecords() {
    const records = [
        ...transactions.map(createTransactionRecord),
        ...payments.map(createPaymentRecord)
    ];

    return records.sort((a, b) => {
        const dateComparison =
            String(b.date || "").localeCompare(String(a.date || ""));

        if (dateComparison !== 0) {
            return dateComparison;
        }

        if (a.kind === b.kind) {
            return 0;
        }

        return a.kind === "transaction" ? -1 : 1;
    });
}

function getFilteredRecords() {
    const records = getCombinedRecords();

    if (activeTab === "all") {
        return records;
    }

    if (activeTab === "daily") {
        return records.filter(record =>
            String(record.date || "").slice(0, 10) === selectedDailyDate
        );
    }

    const today = getNairobiDate();

    if (activeTab === "monthly") {
        return records.filter(record =>
            String(record.date || "").startsWith(today.slice(0, 7))
        );
    }

    if (activeTab === "yearly") {
        return records.filter(record =>
            String(record.date || "").startsWith(today.slice(0, 4))
        );
    }

    return records;
}

function renderRecords() {
    if (!elements.recordsBody) return;

    const records = getFilteredRecords();

    if (!records.length) {
        const message = activeTab === "daily"
            ? `No records found for ${formatDate(selectedDailyDate)}.`
            : "No records found for this period.";

        elements.recordsBody.innerHTML = `
            <tr>
                <td colspan="4" class="empty-state">
                    ${escapeHTML(message)}
                </td>
            </tr>
        `;

        return;
    }

    elements.recordsBody.innerHTML = records.map(record => {
        const amountClass =
            record.kind === "payment" ? "status-paid" : "status-unpaid";

        const amountLabel =
            record.kind === "payment" ? "-" : "+";

        return `
            <tr>
                <td>${formatDate(record.date)}</td>
                <td>
                    <span class="status-badge ${amountClass}">
                        ${escapeHTML(record.type)}
                    </span>
                </td>
                <td>${record.description}</td>
                <td>
                    <strong>${amountLabel}${escapeHTML(formatMoney(record.amount))}</strong>
                </td>
            </tr>
        `;
    }).join("");
}

function setActiveTab(tabName) {
    activeTab = tabName;

    const tabs = [
        [elements.allTab, "all"],
        [elements.dailyTab, "daily"],
        [elements.monthlyTab, "monthly"],
        [elements.yearlyTab, "yearly"]
    ];

    tabs.forEach(([button, name]) => {
        if (!button) return;

        button.classList.toggle("active", name === tabName);
        button.setAttribute(
            "aria-selected",
            name === tabName ? "true" : "false"
        );
    });

    if (elements.dailyDateControls) {
        elements.dailyDateControls.style.display =
            tabName === "daily" ? "flex" : "none";
    }

    renderRecords();
}

// WHATSAPP STATEMENT

function normalizeKenyanPhone(phone) {
    let number = String(phone || "").replace(/\D/g, "");

    if (number.startsWith("0")) {
        number = "254" + number.slice(1);
    } else if (number.startsWith("7") || number.startsWith("1")) {
        number = "254" + number;
    }

    if (!number.startsWith("254") || number.length !== 12) {
        return null;
    }

    return number;
}

function prepareWhatsAppStatement() {
    if (!currentDebtor) {
        showMessage("Customer details are not available.");
        return;
    }

    const phone = normalizeKenyanPhone(currentDebtor.phone);

    if (!phone) {
        showMessage(
            "This customer does not have a valid Kenyan phone number."
        );
        return;
    }

    const records = getCombinedRecords();

    const goods = transactions.reduce(
        (total, transaction) =>
            total + (Number(transaction.total_amount) || 0),
        0
    );

    const paid = payments.reduce(
        (total, payment) =>
            total + (Number(payment.amount) || 0),
        0
    );

    const balance = Number(currentDebtor.balance) || 0;
    const customerCredit = Number(currentDebtor.customer_credit) || 0;

    const lines = [
        "WIN BUSINESS SUITE",
        "CUSTOMER ACCOUNT STATEMENT",
        "",
        `Customer: ${currentDebtor.full_name}`,
        `Phone: ${currentDebtor.phone || "Not provided"}`,
        "",
        "ACCOUNT SUMMARY",
        `Total goods taken: ${formatMoney(goods)}`,
        `Total payments: ${formatMoney(paid)}`,
        `Outstanding balance: ${formatMoney(balance)}`,
        `Customer credit: ${formatMoney(customerCredit)}`,
        "",
        "ACCOUNT RECORDS"
    ];

    records.forEach(record => {
        lines.push(
            `${formatDate(record.date)} | ${record.type} | ${record.plainDescription} | ${formatMoney(record.amount)}`
        );
    });

    lines.push(
        "",
        "Thank you.",
        "WIN Business Suite — Manage Everything. Grow Smarter."
    );

    const whatsappURL =
        `https://wa.me/${phone}?text=${encodeURIComponent(lines.join("\n"))}`;

    window.open(whatsappURL, "_blank", "noopener,noreferrer");
}

// INVENTORY PRODUCTS

async function loadInventoryProducts() {
    try {
        const data = await apiRequest("/api/inventory");

        inventoryProducts = Array.isArray(data.products)
            ? data.products
            : [];

        renderProductRows();
    } catch (error) {
        console.error("Inventory loading error:", error);

        showFormMessage(
            elements.creditMessage,
            `Could not load inventory products: ${error.message}`
        );
    }
}

function getProductOptions(selectedId = "") {
    const availableProducts = inventoryProducts.filter(product =>
        Number(product.stock_quantity) > 0
    );

    if (!availableProducts.length) {
        return '<option value="">No products with available stock</option>';
    }

    return `
        <option value="">Select a product</option>
        ${availableProducts.map(product => `
            <option
                value="${Number(product.id)}"
                ${Number(selectedId) === Number(product.id) ? "selected" : ""}
            >
                ${escapeHTML(product.product_name)}
                — ${escapeHTML(formatMoney(product.selling_price))}
                — Stock: ${escapeHTML(product.stock_quantity)}
            </option>
        `).join("")}
    `;
}

function createProductRow() {
    const row = document.createElement("div");

    row.className = "product-row";
    row.setAttribute("data-product-row", "");

    row.innerHTML = `
        <div class="form-group product-select">
            <label>Inventory Product</label>
            <select class="credit-product-select" required>
                ${getProductOptions()}
            </select>
        </div>

        <div class="form-group">
            <label>Quantity</label>
            <input
                type="number"
                class="credit-product-quantity"
                min="0.01"
                step="0.01"
                value="1"
                required
            >
        </div>

        <div class="product-row-total">
            <span>Line total</span>
            <div class="credit-line-total">${escapeHTML(formatMoney(0))}</div>
        </div>

        <button
            type="button"
            class="remove-product-button"
            aria-label="Remove product"
        >
            Remove
        </button>
    `;

    return row;
}

function renderProductRows() {
    if (!elements.productsContainer) return;

    elements.productsContainer.innerHTML = "";
    elements.productsContainer.appendChild(createProductRow());

    updateProductRows();
}

function getSelectedProductIds(exceptRow = null) {
    if (!elements.productsContainer) return [];

    return Array.from(
        elements.productsContainer.querySelectorAll(".product-row")
    )
        .filter(row => row !== exceptRow)
        .map(row =>
            Number(row.querySelector(".credit-product-select")?.value)
        )
        .filter(id => id > 0);
}

function updateProductRows() {
    if (!elements.productsContainer) return;

    const rows = Array.from(
        elements.productsContainer.querySelectorAll(".product-row")
    );

    let total = 0;

    rows.forEach(row => {
        const select = row.querySelector(".credit-product-select");
        const quantityInput = row.querySelector(".credit-product-quantity");
        const lineTotalElement = row.querySelector(".credit-line-total");
        const removeButton = row.querySelector(".remove-product-button");

        if (!select || !quantityInput || !lineTotalElement) return;

        const productId = Number(select.value);

        const product = inventoryProducts.find(item =>
            Number(item.id) === productId
        );

        const quantity = Number(quantityInput.value) || 0;

        if (product && quantity > 0) {
            const lineTotal = roundMoney(
                quantity * Number(product.selling_price)
            );

            lineTotalElement.textContent = formatMoney(lineTotal);
            total += lineTotal;
        } else {
            lineTotalElement.textContent = formatMoney(0);
        }

        const otherSelectedIds = getSelectedProductIds(row);

        Array.from(select.options).forEach(option => {
            const optionId = Number(option.value);

            if (optionId > 0) {
                option.disabled =
                    optionId !== productId &&
                    otherSelectedIds.includes(optionId);
            }
        });

        if (removeButton) {
            removeButton.disabled = rows.length === 1;
        }
    });

    if (elements.creditTotal) {
        elements.creditTotal.textContent = formatMoney(total);
    }
}

function addProductRow() {
    if (!elements.productsContainer) return;

    elements.productsContainer.appendChild(createProductRow());
    updateProductRows();
}

function collectCreditItems() {
    if (!elements.productsContainer) {
        throw new Error("The product selection area is unavailable.");
    }

    const rows = Array.from(
        elements.productsContainer.querySelectorAll(".product-row")
    );

    const items = [];

    for (const row of rows) {
        const productId = Number(
            row.querySelector(".credit-product-select")?.value
        );

        const quantity = Number(
            row.querySelector(".credit-product-quantity")?.value
        );

        if (!productId || !Number.isFinite(quantity) || quantity <= 0) {
            throw new Error("Select a product and enter a valid quantity.");
        }

        const product = inventoryProducts.find(item =>
            Number(item.id) === productId
        );

        if (!product) {
            throw new Error(
                "One of the selected products is no longer available."
            );
        }

        if (quantity > Number(product.stock_quantity)) {
            throw new Error(
                `Not enough stock for ${product.product_name}. Available stock: ${product.stock_quantity}.`
            );
        }

        if (items.some(item => item.product_id === productId)) {
            throw new Error(
                "Please select each product only once per transaction."
            );
        }

        items.push({
            product_id: productId,
            quantity
        });
    }

    if (!items.length) {
        throw new Error("Add at least one product.");
    }

    return items;
}

// RECORD GOODS TAKEN

async function saveCreditTransaction(event) {
    event.preventDefault();

    if (creditSaving) return;

    showFormMessage(elements.creditMessage, "");

    if (!currentDebtor) {
        showFormMessage(
            elements.creditMessage,
            "Customer account is not loaded."
        );
        return;
    }

    if (
        currentDebtor.credit_enabled !== true &&
        Number(currentDebtor.credit_enabled) !== 1
    ) {
        showFormMessage(
            elements.creditMessage,
            "Credit is disabled for this customer."
        );
        return;
    }

    if (!elements.saveCreditButton) return;

    let items;

    try {
        items = collectCreditItems();
    } catch (error) {
        showFormMessage(elements.creditMessage, error.message);
        return;
    }

    creditSaving = true;
    elements.saveCreditButton.disabled = true;
    elements.saveCreditButton.textContent = "Saving...";

    try {
        const result = await apiRequest(
            `${API_BASE}/${debtorId}/transactions`,
            {
                method: "POST",
                body: JSON.stringify({
                    items,
                    notes: elements.creditNotes?.value.trim() || ""
                })
            }
        );

        showFormMessage(
            elements.creditMessage,
            result.message ||
                "Goods taken recorded successfully. Inventory stock has been updated.",
            "success"
        );

        if (elements.creditForm) {
            elements.creditForm.reset();
        }

        if (elements.creditNotes) {
            elements.creditNotes.value = "";
        }

        await refreshNotebook();
        await loadInventoryProducts();
    } catch (error) {
        console.error("Credit transaction error:", error);

        showFormMessage(elements.creditMessage, error.message);
    } finally {
        creditSaving = false;
        elements.saveCreditButton.disabled = false;
        elements.saveCreditButton.textContent = "Save Goods Taken";
    }
}

// RECORD CUSTOMER PAYMENTS

async function savePayment(event) {
    event.preventDefault();

    if (paymentSaving) return;

    showFormMessage(elements.paymentMessage, "");

    if (!currentDebtor) {
        showFormMessage(
            elements.paymentMessage,
            "Customer account is not loaded."
        );
        return;
    }

    if (!elements.savePaymentButton) return;

    const today = getNairobiDate();

    setPaymentDateLimit();

    const amount = Number(elements.paymentAmount?.value);
    const paymentDate = elements.paymentDate?.value;
    const paymentMethod = elements.paymentMethod?.value;
    const reference = elements.paymentReference?.value.trim() || "";
    const notes = elements.paymentNotes?.value.trim() || "";

    if (!Number.isFinite(amount) || amount <= 0) {
        showFormMessage(
            elements.paymentMessage,
            "Enter a valid payment amount."
        );
        return;
    }

    if (!paymentDate) {
        showFormMessage(
            elements.paymentMessage,
            "Select the payment date."
        );
        return;
    }

    if (paymentDate !== today) {
        showFormMessage(
            elements.paymentMessage,
            "Payments must be recorded using today's date."
        );

        setPaymentDateLimit();
        return;
    }

    if (!paymentMethod) {
        showFormMessage(
            elements.paymentMessage,
            "Select a payment method."
        );
        return;
    }

    const balance = roundMoney(
        Number(currentDebtor.balance) || 0
    );

    const roundedAmount = roundMoney(amount);

    const paymentType = roundedAmount > balance
        ? "overpayment"
        : roundedAmount === balance
            ? "full"
            : "partial";

    paymentSaving = true;
    elements.savePaymentButton.disabled = true;
    elements.savePaymentButton.textContent = "Saving...";

    try {
        const result = await apiRequest(
            `${API_BASE}/${debtorId}/payments`,
            {
                method: "POST",
                body: JSON.stringify({
                    amount: roundedAmount,
                    payment_type: paymentType,
                    payment_method: paymentMethod,
                    payment_date: paymentDate,
                    reference,
                    notes
                })
            }
        );

        showFormMessage(
            elements.paymentMessage,
            result.message || "Payment recorded successfully.",
            "success"
        );

        if (elements.paymentForm) {
            elements.paymentForm.reset();
        }

        setPaymentDateLimit();

        await refreshNotebook();
    } catch (error) {
        console.error("Payment recording error:", error);

        showFormMessage(elements.paymentMessage, error.message);
    } finally {
        paymentSaving = false;
        elements.savePaymentButton.disabled = false;
        elements.savePaymentButton.textContent = "Save Payment";
    }
}

// LOAD AND REFRESH CUSTOMER NOTEBOOK

async function refreshNotebook() {
    if (!Number.isInteger(debtorId) || debtorId <= 0) {
        throw new Error("Invalid customer account.");
    }

    const thisRequest = ++notebookRequestNumber;

    const [profileData, historyData] = await Promise.all([
        apiRequest(`${API_BASE}/${debtorId}`),
        apiRequest(`${API_BASE}/${debtorId}/history`)
    ]);

    if (thisRequest !== notebookRequestNumber) {
        return;
    }

    if (!profileData.debtor || !historyData.debtor) {
        throw new Error("Customer account information is incomplete.");
    }

    displayDebtor(profileData.debtor);

    transactions = Array.isArray(historyData.transactions)
        ? historyData.transactions
        : [];

    payments = Array.isArray(historyData.payments)
        ? historyData.payments
        : [];

    renderRecords();
}

async function loadDebtorProfile() {
    if (!Number.isInteger(debtorId) || debtorId <= 0) {
        showMessage(
            "Invalid customer account. Return to Debtor Management."
        );

        if (elements.customerName) {
            elements.customerName.textContent = "Invalid customer account";
        }

        return;
    }

    clearMessage();

    try {
        await refreshNotebook();
    } catch (error) {
        console.error("Load debtor notebook error:", error);

        showMessage(
            error.message || "Could not load this customer's notebook."
        );

        if (elements.customerName) {
            elements.customerName.textContent = "Could not load customer";
        }
    }
}

// EVENT LISTENERS AND INITIALIZATION

function initializeNotebook() {
    if (elements.logoutButton) {
        elements.logoutButton.addEventListener("click", logout);
    }

    if (elements.allTab) {
        elements.allTab.addEventListener("click", () =>
            setActiveTab("all")
        );
    }

    if (elements.dailyTab) {
        elements.dailyTab.addEventListener("click", () =>
            setActiveTab("daily")
        );
    }

    if (elements.monthlyTab) {
        elements.monthlyTab.addEventListener("click", () =>
            setActiveTab("monthly")
        );
    }

    if (elements.yearlyTab) {
        elements.yearlyTab.addEventListener("click", () =>
            setActiveTab("yearly")
        );
    }

    if (elements.dailyNotebookDate) {
        elements.dailyNotebookDate.addEventListener("change", () => {
            const chosenDate = elements.dailyNotebookDate.value;
            const today = getNairobiDate();

            if (!chosenDate) {
                elements.dailyNotebookDate.value =
                    selectedDailyDate || today;
                return;
            }

            if (chosenDate > today) {
                elements.dailyNotebookDate.value = today;
                selectedDailyDate = today;

                showMessage("Future notebook dates are not available.");
            } else {
                selectedDailyDate = chosenDate;
                clearMessage();
            }

            renderRecords();
        });
    }

    if (elements.whatsappButton) {
        elements.whatsappButton.addEventListener("click", event => {
            event.preventDefault();
            prepareWhatsAppStatement();
        });
    }

    if (elements.addProductButton) {
        elements.addProductButton.addEventListener("click", addProductRow);
    }

    if (elements.productsContainer) {
        elements.productsContainer.addEventListener("change", event => {
            if (
                event.target.classList.contains("credit-product-select") ||
                event.target.classList.contains("credit-product-quantity")
            ) {
                updateProductRows();
            }
        });

        elements.productsContainer.addEventListener("input", event => {
            if (
                event.target.classList.contains("credit-product-quantity")
            ) {
                updateProductRows();
            }
        });

        elements.productsContainer.addEventListener("click", event => {
            const removeButton = event.target.closest(
                ".remove-product-button"
            );

            if (!removeButton) return;

            const rows = elements.productsContainer.querySelectorAll(
                ".product-row"
            );

            if (rows.length <= 1) return;

            removeButton.closest(".product-row").remove();
            updateProductRows();
        });
    }

    if (elements.creditForm) {
        elements.creditForm.addEventListener(
            "submit",
            saveCreditTransaction
        );
    }

    if (elements.paymentForm) {
        elements.paymentForm.addEventListener("submit", savePayment);
    }

    initializeDailyDateSelector();
    setPaymentDateLimit();

    setActiveTab("all");

    loadAccount();
    loadDebtorProfile();
    loadInventoryProducts();
}

document.addEventListener("DOMContentLoaded", initializeNotebook);
