
"use strict";

const API = {
    account: "/api/auth/me",
    products: "/api/inventory",
    sales: "/api/sales",
    summary: "/api/sales/summary",
    debtors: "/api/debtors"
};

let products = [];
let customers = [];
let cart = [];
let currentPage = 1;
let totalPages = 1;

const pageLimit = 20;
const $ = (id) => document.getElementById(id);

function escapeHTML(value) {
    return String(value ?? "").replace(/[&<>"']/g, character => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#039;"
    })[character]);
}

function money(value) {
    return "KSh " + Number(value || 0).toLocaleString("en-KE", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    });
}

function roundMoney(value) {
    return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
}

function kenyaToday() {
    return new Intl.DateTimeFormat("en-CA", {
        timeZone: "Africa/Nairobi",
        year: "numeric",
        month: "2-digit",
        day: "2-digit"
    }).format(new Date());
}

function showMessage(id, message, isError = false) {
    const element = $(id);
    if (!element) return;

    element.textContent = message;
    element.style.color = isError ? "#b91c1c" : "#15803d";
}

async function apiRequest(url, options = {}) {
    const requestOptions = {
        ...options,
        credentials: "same-origin",
        headers: {
            ...(options.body ? { "Content-Type": "application/json" } : {}),
            ...(options.headers || {})
        }
    };

    const response = await fetch(url, requestOptions);

    let data = {};

    try {
        data = await response.json();
    } catch {
        data = {};
    }

    if (response.status === 401) {
        window.location.href = "/login.html";
        throw new Error("Your session has expired. Please log in again.");
    }

    if (!response.ok || data.success === false) {
        throw new Error(
            data.message ||
            data.error ||
            `Request failed (${response.status}).`
        );
    }

    return data;
}

function getProductId(product) {
    return Number(product.id ?? product.product_id);
}

function getProductName(product) {
    return product.product_name || product.name || "Unnamed product";
}

function getProductPrice(product) {
    return Number(product.selling_price ?? 0);
}

function getProductStock(product) {
    return Number(product.stock_quantity ?? product.quantity ?? 0);
}

function getSaleId(sale) {
    return Number(sale.id ?? sale.sale_id);
}

function formatDate(value) {
    if (!value) return "—";

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
        return String(value);
    }

    return date.toLocaleString("en-KE", {
        timeZone: "Africa/Nairobi",
        dateStyle: "medium",
        timeStyle: "short"
    });
}

function paymentStatusLabel(status) {
    const labels = {
        paid: "Paid",
        partially_paid: "Partially paid",
        unpaid: "Unpaid"
    };

    return labels[String(status || "").toLowerCase()] || status || "Unknown";
}

async function loadAccount() {
    const data = await apiRequest(API.account);
    const user = data.user || data;

    $("userName").textContent =
        user.full_name ||
        user.name ||
        user.username ||
        "User";

    $("businessName").textContent =
        user.business_name ||
        user.businessName ||
        "Your Business";
}

async function loadProducts() {
    const data = await apiRequest(API.products);

    products = Array.isArray(data)
        ? data
        : (data.products || data.data || []);

    renderProductOptions();
    renderCart();
}

async function loadCustomers() {
    const data = await apiRequest(API.debtors);

    customers = Array.isArray(data.debtors)
        ? data.debtors
        : [];

    renderCustomerOptions();
}

function renderCustomerOptions() {
    const select = $("customerSelect");
    const previousValue = select.value;

    const eligibleCustomers = customers.filter(customer => {
        return Number(customer.id) > 0;
    });

    select.innerHTML = `
        <option value="">Walk-in customer (fully paid only)</option>
        ${eligibleCustomers.map(customer => {
            const name = escapeHTML(customer.full_name || "Customer");
            const phone = customer.phone
                ? ` — ${escapeHTML(customer.phone)}`
                : "";

            const disabled = Number(customer.credit_enabled) !== 1
                ? " (Credit disabled)"
                : "";

            return `
                <option value="${Number(customer.id)}">
                    ${name}${phone}${disabled}
                </option>
            `;
        }).join("")}
    `;

    if (
        previousValue &&
        eligibleCustomers.some(customer => {
            return Number(customer.id) === Number(previousValue);
        })
    ) {
        select.value = previousValue;
    }
}

function renderProductOptions() {
    const select = $("productSelect");
    const previousValue = select.value;

    const availableProducts = products.filter(product => {
        return getProductId(product) > 0;
    });

    if (!availableProducts.length) {
        select.innerHTML = '<option value="">No products available</option>';
        return;
    }

    select.innerHTML = `
        <option value="">Choose a product</option>
        ${availableProducts.map(product => {
            const id = getProductId(product);
            const name = escapeHTML(getProductName(product));
            const stock = getProductStock(product);
            const price = money(getProductPrice(product));

            return `
                <option value="${id}" ${stock <= 0 ? "disabled" : ""}>
                    ${name} — ${price} — Stock: ${stock}
                    ${stock <= 0 ? "(Out of stock)" : ""}
                </option>
            `;
        }).join("")}
    `;

    if (previousValue) {
        select.value = previousValue;
    }
}

function getCartSubtotal() {
    return roundMoney(
        cart.reduce((total, item) => {
            return total + item.quantity * item.unit_price;
        }, 0)
    );
}

function getDiscount() {
    return roundMoney(
        Math.max(0, Number($("discountAmount").value) || 0)
    );
}

function getSaleTotal() {
    return roundMoney(
        Math.max(0, getCartSubtotal() - getDiscount())
    );
}

function getPaymentRows() {
    return [...document.querySelectorAll("[data-payment-row]")];
}

function getPaymentTotal() {
    return roundMoney(
        getPaymentRows().reduce((total, row) => {
            const input = row.querySelector("[data-payment-amount]");
            return total + (Number(input.value) || 0);
        }, 0)
    );
}

function renderCart() {
    const tbody = $("cartTableBody");

    if (!cart.length) {
        tbody.innerHTML = `
            <tr>
                <td colspan="6" class="sales-empty">
                    Your cart is empty.
                </td>
            </tr>
        `;
    } else {
        tbody.innerHTML = cart.map(item => {
            const lineTotal = roundMoney(
                item.quantity * item.unit_price
            );

            return `
                <tr>
                    <td>${escapeHTML(item.product_name)}</td>
                    <td>${escapeHTML(item.available_stock)}</td>
                    <td>${money(item.unit_price)}</td>
                    <td>${escapeHTML(item.quantity)}</td>
                    <td>${money(lineTotal)}</td>
                    <td>
                        <button
                            type="button"
                            class="sales-button danger-button"
                            data-remove-cart="${item.product_id}"
                        >
                            Remove
                        </button>
                    </td>
                </tr>
            `;
        }).join("");
    }

    $("cartSubtotal").textContent = money(getCartSubtotal());
    $("cartDiscount").textContent = money(getDiscount());
    $("cartGrandTotal").textContent = money(getSaleTotal());

    updatePaymentTotals();
}

function addProductToCart() {
    const productId = Number($("productSelect").value);
    const quantity = Number($("productQuantity").value);

    if (!productId) {
        showMessage("productMessage", "Please select a product.", true);
        return;
    }

    if (!Number.isFinite(quantity) || quantity <= 0) {
        showMessage("productMessage", "Enter a valid quantity.", true);
        return;
    }

    const product = products.find(item => {
        return getProductId(item) === productId;
    });

    if (!product) {
        showMessage("productMessage", "Product was not found.", true);
        return;
    }

    const availableStock = getProductStock(product);

    const existingItem = cart.find(item => {
        return item.product_id === productId;
    });

    const alreadyInCart = existingItem
        ? existingItem.quantity
        : 0;

    const newQuantity = roundMoney(alreadyInCart + quantity);

    if (newQuantity > availableStock) {
        showMessage(
            "productMessage",
            `Not enough stock. Available: ${availableStock}.`,
            true
        );
        return;
    }

    const price = getProductPrice(product);

    if (!Number.isFinite(price) || price < 0) {
        showMessage(
            "productMessage",
            "This product has an invalid selling price.",
            true
        );
        return;
    }

    if (existingItem) {
        existingItem.quantity = newQuantity;
    } else {
        cart.push({
            product_id: productId,
            product_name: getProductName(product),
            quantity,
            unit_price: price,
            available_stock: availableStock
        });
    }

    $("productQuantity").value = "1";

    showMessage("productMessage", "Product added to cart.");
    renderCart();
}

function removeCartItem(productId) {
    cart = cart.filter(item => {
        return item.product_id !== Number(productId);
    });

    renderCart();
}

function addPaymentRow() {
    const container = $("paymentRows");

    const row = document.createElement("div");

    row.className = "payment-row";
    row.setAttribute("data-payment-row", "");

    row.innerHTML = `
        <div>
            <label>Method</label>
            <select data-payment-method>
                <option value="cash">Cash</option>
                <option value="mpesa">M-Pesa</option>
                <option value="bank_transfer">Bank Transfer</option>
                <option value="other">Other</option>
            </select>
        </div>

        <div>
            <label>Amount (KSh)</label>
            <input
                type="number"
                data-payment-amount
                min="0"
                step="0.01"
                placeholder="Amount received"
            >
        </div>

        <div>
            <label>Ref</label>
            <input
                type="text"
                data-payment-reference
                maxlength="100"
                placeholder="Optional"
            >
        </div>

        <div>
            <button
                type="button"
                class="sales-button danger-button"
                data-remove-payment
            >
                Remove
            </button>
        </div>
    `;

    container.appendChild(row);
    updatePaymentTotals();
}

function updatePaymentTotals() {
    const total = getSaleTotal();
    const entered = getPaymentTotal();
    const balance = roundMoney(total - entered);

    $("paymentEntered").textContent = money(entered);
    $("paymentDifference").textContent = money(Math.max(0, balance));

    $("paymentDifference").style.color =
        balance > 0.005 ? "#b91c1c" : "#15803d";

    const rows = getPaymentRows();

    if (rows.length === 1) {
        const firstAmount = rows[0].querySelector(
            "[data-payment-amount]"
        );

        if (
            firstAmount &&
            (
                firstAmount.value === "" ||
                firstAmount.dataset.automatic === "true"
            )
        ) {
            firstAmount.value = total > 0 ? total.toFixed(2) : "";
            firstAmount.dataset.automatic = "true";
        }
    }

    rows.forEach((row, index) => {
        const removeButton = row.querySelector("[data-remove-payment]");
        if (removeButton) {
            removeButton.disabled = rows.length <= 1;
        }
    });
}

function collectPayments() {
    const payments = [];

    for (const row of getPaymentRows()) {
        const method = row.querySelector("[data-payment-method]").value;
        const amountInput = row.querySelector("[data-payment-amount]");
        const reference = row.querySelector(
            "[data-payment-reference]"
        ).value.trim();

        const rawAmount = amountInput.value.trim();

        if (!rawAmount) {
            continue;
        }

        const amount = roundMoney(Number(rawAmount));

        if (!Number.isFinite(amount) || amount <= 0) {
            throw new Error(
                "Each entered payment must be greater than zero."
            );
        }

        payments.push({
            payment_method: method,
            amount,
            ...(reference ? { reference } : {})
        });
    }

    return payments;
}

async function registerCustomer() {
    const fullName = $("newCustomerName").value.trim();
    const phone = $("newCustomerPhone").value.trim();
    const email = $("newCustomerEmail").value.trim();
    const creditLimit = Number($("newCustomerCreditLimit").value || 0);

    if (!fullName) {
        showMessage(
            "customerMessage",
            "Enter the customer's full name.",
            true
        );
        return;
    }

    if (!Number.isFinite(creditLimit) || creditLimit < 0) {
        showMessage(
            "customerMessage",
            "Enter a valid credit limit.",
            true
        );
        return;
    }

    const button = $("registerCustomerButton");
    button.disabled = true;
    button.textContent = "Registering...";

    try {
        const data = await apiRequest(API.debtors, {
            method: "POST",
            body: JSON.stringify({
                full_name: fullName,
                phone,
                email,
                credit_limit: creditLimit
            })
        });

        const customerId = Number(
            data.debtor_id ||
            data.customer_id ||
            data.debtor?.id
        );

        await loadCustomers();

        if (customerId) {
            $("customerSelect").value = String(customerId);
        }

        $("newCustomerName").value = "";
        $("newCustomerPhone").value = "";
        $("newCustomerEmail").value = "";
        $("newCustomerCreditLimit").value = "0";
        $("newCustomerDetails").open = false;

        showMessage(
            "customerMessage",
            data.message || "Customer registered successfully."
        );
    } catch (error) {
        showMessage("customerMessage", error.message, true);
    } finally {
        button.disabled = false;
        button.textContent = "Register Customer";
    }
}

async function completeSale() {
    if (!cart.length) {
        showMessage(
            "saleMessage",
            "Add at least one product first.",
            true
        );
        return;
    }

    const subtotal = getCartSubtotal();
    const discount = getDiscount();
    const total = getSaleTotal();

    if (discount > subtotal) {
        showMessage(
            "saleMessage",
            "Discount cannot be greater than the subtotal.",
            true
        );
        return;
    }

    if (total <= 0) {
        showMessage(
            "saleMessage",
            "The sale total must be greater than zero.",
            true
        );
        return;
    }

    let payments;

    try {
        payments = collectPayments();
    } catch (error) {
        showMessage("saleMessage", error.message, true);
        return;
    }

    const paymentTotal = roundMoney(
        payments.reduce((sum, payment) => {
            return sum + payment.amount;
        }, 0)
    );

    if (paymentTotal - total > 0.005) {
        showMessage(
            "saleMessage",
            `Payments cannot exceed the sale total of ${money(total)}.`,
            true
        );
        return;
    }

    const balanceDue = roundMoney(
        Math.max(0, total - paymentTotal)
    );

    const customerId = Number($("customerSelect").value) || null;

    if (balanceDue > 0.005 && !customerId) {
        showMessage(
            "saleMessage",
            "Select or register a customer before recording an unpaid balance.",
            true
        );
        return;
    }

    if (balanceDue > 0.005) {
        const customer = customers.find(item => {
            return Number(item.id) === customerId;
        });

        if (!customer) {
            showMessage(
                "saleMessage",
                "The selected customer could not be found. Refresh customers and try again.",
                true
            );
            return;
        }

        if (Number(customer.credit_enabled) !== 1) {
            showMessage(
                "saleMessage",
                "Credit is disabled for this customer. Choose another customer or record a fully paid sale.",
                true
            );
            return;
        }
    }

    const button = $("completeSaleButton");
    button.disabled = true;
    button.textContent = "Recording Sale...";

    const payload = {
        items: cart.map(item => ({
            product_id: item.product_id,
            quantity: item.quantity
        })),
        discount_amount: discount,
        payments,
        notes: $("saleNotes").value.trim(),
        ...(customerId ? { customer_id: customerId } : {})
    };

    try {
        const data = await apiRequest(API.sales, {
            method: "POST",
            body: JSON.stringify(payload)
        });

        const sale = data.sale || data;
        const saleId = sale.id || sale.sale_id;

        showMessage(
            "saleMessage",
            [
                "Sale recorded successfully.",
                sale.sale_number ? `Sale No.: ${sale.sale_number}.` : "",
                balanceDue > 0.005
                    ? `Outstanding debt: ${money(balanceDue)}.`
                    : "Fully paid."
            ].filter(Boolean).join(" ")
        );

        cart = [];
        $("discountAmount").value = "0";
        $("saleNotes").value = "";
        $("customerSelect").value = "";

        resetPayments();
        renderCart();

        await Promise.all([
            loadProducts(),
            loadCustomers(),
            loadSales(),
            loadSummary()
        ]);

        if (saleId) {
            await showSaleDetails(saleId);
            activateView("saleDetailsPanel");
        }
    } catch (error) {
        showMessage("saleMessage", error.message, true);
    } finally {
        button.disabled = false;
        button.textContent = "Complete Sale";
    }
}

function resetPayments() {
    const rows = getPaymentRows();

    rows.slice(1).forEach(row => row.remove());

    const first = getPaymentRows()[0];

    if (first) {
        first.querySelector("[data-payment-method]").value = "cash";

        const amount = first.querySelector("[data-payment-amount]");
        amount.value = "";
        amount.dataset.automatic = "true";

        first.querySelector("[data-payment-reference]").value = "";
    }

    updatePaymentTotals();
}

function getHistoryFilters() {
    const params = new URLSearchParams();

    params.set("page", String(currentPage));
    params.set("limit", String(pageLimit));

    const startDate = $("historyStartDate").value;
    const endDate = $("historyEndDate").value;
    const search = $("salesSearch").value.trim();

    if (startDate) params.set("start_date", startDate);
    if (endDate) params.set("end_date", endDate);
    if (search) params.set("search", search);

    return params;
}

async function loadSales() {
    const tbody = $("salesTableBody");

    tbody.innerHTML = `
        <tr>
            <td colspan="8" class="sales-empty">Loading sales...</td>
        </tr>
    `;

    try {
        const params = getHistoryFilters();
        const data = await apiRequest(
            `${API.sales}?${params.toString()}`
        );

        const sales = data.sales || [];
        const pagination = data.pagination || {};

        currentPage = Number(pagination.page || currentPage);
        totalPages = Number(pagination.total_pages || 1);

        $("paginationInfo").textContent =
            `Page ${currentPage} of ${totalPages} — ${pagination.total || sales.length} transactions`;

        $("previousPageButton").disabled = currentPage <= 1;
        $("nextPageButton").disabled = currentPage >= totalPages;

        if (!sales.length) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="8" class="sales-empty">
                        No sales found for these filters.
                    </td>
                </tr>
            `;
            return;
        }

        tbody.innerHTML = sales.map(sale => {
            const id = getSaleId(sale);

            return `
                <tr>
                    <td>${escapeHTML(sale.sale_number || "—")}</td>
                    <td>${escapeHTML(formatDate(sale.sale_date || sale.created_at))}</td>
                    <td>${money(sale.subtotal)}</td>
                    <td>${money(sale.discount_amount)}</td>
                    <td><strong>${money(sale.total_amount)}</strong></td>
                    <td>
                        <span class="status-pill">
                            ${escapeHTML(paymentStatusLabel(sale.payment_status))}
                        </span>
                    </td>
                    <td>${escapeHTML(sale.cashier_name || "—")}</td>
                    <td>
                        <button
                            type="button"
                            class="sales-button action-button"
                            data-view-sale="${id}"
                        >
                            View
                        </button>
                    </td>
                </tr>
            `;
        }).join("");
    } catch (error) {
        tbody.innerHTML = `
            <tr>
                <td colspan="8" class="sales-empty">
                    ${escapeHTML(error.message)}
                </td>
            </tr>
        `;

        showMessage("historyMessage", error.message, true);
    }
}

async function loadSummary() {
    const params = new URLSearchParams();

    const startDate = $("historyStartDate").value;
    const endDate = $("historyEndDate").value;

    if (startDate) params.set("start_date", startDate);
    if (endDate) params.set("end_date", endDate);

    try {
        const query = params.toString();
        const url = query
            ? `${API.summary}?${query}`
            : API.summary;

        const data = await apiRequest(url);
        const summary = data.summary || data;

        $("totalSales").textContent =
            Number(summary.total_sales || 0).toLocaleString("en-KE");

        $("salesSubtotal").textContent = money(summary.subtotal);
        $("salesDiscounts").textContent = money(summary.discounts);
        $("salesRevenue").textContent = money(summary.total_revenue);
        $("salesReceived").textContent = money(summary.amount_received);
    } catch (error) {
        console.error("Could not load sales summary:", error);
    }
}

async function showSaleDetails(saleId) {
    const content = $("saleDetailsContent");

    content.textContent = "Loading transaction details...";
    $("detailsMessage").textContent = "";

    try {
        const data = await apiRequest(
            `${API.sales}/${encodeURIComponent(saleId)}`
        );

        const sale = data.sale || {};
        const items = data.items || [];
        const payments = data.payments || [];

        const balanceDue = Number(
            sale.balance_due ??
            Math.max(
                0,
                Number(sale.total_amount || 0) -
                Number(sale.amount_paid || 0)
            )
        );

        content.innerHTML = `
            <h3>
                Receipt: ${escapeHTML(sale.sale_number || "Sale")}
            </h3>

            <p>
                <strong>Date:</strong>
                ${escapeHTML(formatDate(sale.sale_date || sale.created_at))}
            </p>

            <p>
                <strong>Cashier:</strong>
                ${escapeHTML(sale.cashier_name || "—")}
            </p>

            <p>
                <strong>Customer:</strong>
                ${escapeHTML(sale.customer_name || sale.full_name || "Walk-in customer")}
            </p>

            <p>
                <strong>Status:</strong>
                <span class="status-pill">
                    ${escapeHTML(paymentStatusLabel(sale.payment_status))}
                </span>
            </p>

            <h4 style="margin-top:18px;">Products</h4>

            <div class="sales-table-wrap">
                <table class="sales-table">
                    <thead>
                        <tr>
                            <th>Product</th>
                            <th>Qty</th>
                            <th>Price</th>
                            <th>Total</th>
                        </tr>
                    </thead>

                    <tbody>
                        ${items.length ? items.map(item => `
                            <tr>
                                <td>${escapeHTML(item.product_name || "Product")}</td>
                                <td>${escapeHTML(item.quantity)}</td>
                                <td>${money(item.unit_price)}</td>
                                <td>${money(item.line_total)}</td>
                            </tr>
                        `).join("") : `
                            <tr>
                                <td colspan="4" class="sales-empty">
                                    No items found.
                                </td>
                            </tr>
                        `}
                    </tbody>
                </table>
            </div>

            <h4 style="margin-top:18px;">Payments</h4>

            <div class="sales-table-wrap">
                <table class="sales-table">
                    <thead>
                        <tr>
                            <th>Method</th>
                            <th>Amount</th>
                            <th>Ref</th>
                            <th>Date</th>
                        </tr>
                    </thead>

                    <tbody>
                        ${payments.length ? payments.map(payment => `
                            <tr>
                                <td>${escapeHTML(payment.payment_method || "—")}</td>
                                <td>${money(payment.amount)}</td>
                                <td>${escapeHTML(payment.reference || "—")}</td>
                                <td>${escapeHTML(formatDate(payment.payment_date || payment.created_at))}</td>
                            </tr>
                        `).join("") : `
                            <tr>
                                <td colspan="4" class="sales-empty">
                                    No payments recorded yet.
                                </td>
                            </tr>
                        `}
                    </tbody>
                </table>
            </div>

            <div class="sales-totals">
                <div class="summary-row">
                    <span>Subtotal</span>
                    <strong>${money(sale.subtotal)}</strong>
                </div>

                <div class="summary-row">
                    <span>Discount</span>
                    <strong>${money(sale.discount_amount)}</strong>
                </div>

                <div class="summary-row grand-total">
                    <span>Total</span>
                    <strong>${money(sale.total_amount)}</strong>
                </div>

                <div class="summary-row">
                    <span>Amount Paid</span>
                    <strong>${money(sale.amount_paid)}</strong>
                </div>

                <div class="summary-row">
                    <span>Balance Due</span>
                    <strong style="color:${balanceDue > 0 ? "#b91c1c" : "#15803d"}">
                        ${money(balanceDue)}
                    </strong>
                </div>
            </div>

            ${sale.notes ? `
                <p style="margin-top:14px;">
                    <strong>Notes:</strong>
                    ${escapeHTML(sale.notes)}
                </p>
            ` : ""}
        `;
    } catch (error) {
        content.textContent = error.message;
        showMessage("detailsMessage", error.message, true);
    }
}

function activateView(viewId) {
    const views = [
        "sellPanel",
        "historyPanel",
        "saleDetailsPanel"
    ];

    views.forEach(id => {
        $(id).hidden = id !== viewId;
    });

    document.querySelectorAll("[data-sales-view]").forEach(button => {
        button.classList.toggle(
            "active",
            button.dataset.salesView === viewId
        );
    });

    if (viewId === "historyPanel") {
        loadSales();
    }

    $(viewId).scrollIntoView({
        behavior: "smooth",
        block: "start"
    });
}

function applyFilters() {
    currentPage = 1;
    loadSales();
    loadSummary();
}

function changePage(direction) {
    const nextPage = currentPage + direction;

    if (nextPage < 1 || nextPage > totalPages) {
        return;
    }

    currentPage = nextPage;
    loadSales();
}

async function logout() {
    try {
        await apiRequest("/api/auth/logout", {
            method: "POST"
        });
    } catch (error) {
        console.error("Logout request failed:", error);
    }

    window.location.href = "/login.html";
}

function attachEvents() {
    $("addToCartButton").addEventListener(
        "click",
        addProductToCart
    );

    $("registerCustomerButton").addEventListener(
        "click",
        registerCustomer
    );

    $("cartTableBody").addEventListener("click", event => {
        const button = event.target.closest("[data-remove-cart]");

        if (!button) return;

        removeCartItem(button.dataset.removeCart);
    });

    $("discountAmount").addEventListener("input", renderCart);

    $("addPaymentButton").addEventListener(
        "click",
        addPaymentRow
    );

    $("paymentRows").addEventListener("input", event => {
        if (event.target.matches("[data-payment-amount]")) {
            event.target.dataset.automatic = "false";
            updatePaymentTotals();
        }
    });

    $("paymentRows").addEventListener(
        "change",
        updatePaymentTotals
    );

    $("paymentRows").addEventListener("click", event => {
        const button = event.target.closest("[data-remove-payment]");

        if (!button) return;

        const rows = getPaymentRows();

        if (rows.length <= 1) return;

        button.closest("[data-payment-row]").remove();
        updatePaymentTotals();
    });

    $("completeSaleButton").addEventListener(
        "click",
        completeSale
    );

    $("filterSalesButton").addEventListener(
        "click",
        applyFilters
    );

    $("refreshSalesButton").addEventListener("click", async () => {
        await Promise.all([
            loadProducts(),
            loadCustomers(),
            loadSales(),
            loadSummary()
        ]);
    });

    $("salesSearch").addEventListener("keydown", event => {
        if (event.key === "Enter") {
            applyFilters();
        }
    });

    $("salesTableBody").addEventListener("click", event => {
        const button = event.target.closest("[data-view-sale]");

        if (!button) return;

        activateView("saleDetailsPanel");
        showSaleDetails(button.dataset.viewSale);
    });

    $("previousPageButton").addEventListener("click", () => {
        changePage(-1);
    });

    $("nextPageButton").addEventListener("click", () => {
        changePage(1);
    });

    $("closeSaleDetailsButton").addEventListener("click", () => {
        activateView("historyPanel");
    });

    document.querySelectorAll("[data-sales-view]").forEach(button => {
        button.addEventListener("click", () => {
            activateView(button.dataset.salesView);
        });
    });

    $("logoutButton").addEventListener("click", logout);
}

async function initializeSalesPage() {
    $("historyStartDate").value = kenyaToday();
    $("historyEndDate").value = kenyaToday();

    attachEvents();
    updatePaymentTotals();

    try {
        await loadAccount();

        await Promise.all([
            loadProducts(),
            loadCustomers(),
            loadSales(),
            loadSummary()
        ]);

        resetPayments();
        renderCart();

        activateView("sellPanel");
    } catch (error) {
        showMessage("saleMessage", error.message, true);
    }
}

document.addEventListener(
    "DOMContentLoaded",
    initializeSalesPage
);
