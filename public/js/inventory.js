
"use strict";

/* =========================================
   WIN BUSINESS SUITE — INVENTORY
========================================= */

const API = {
    account: "/api/auth/me",
    categories: "/api/categories",
    products: "/api/inventory",
    summary: "/api/inventory/summary"
};

let products = [];
let categories = [];
let editingProductId = null;

const elements = {
    userName: document.getElementById("userName"),
    businessName: document.getElementById("businessName"),
    logoutButton: document.getElementById("logoutButton"),

    totalProducts: document.getElementById("totalProducts"),
    totalStock: document.getElementById("totalStock"),
    lowStockProducts: document.getElementById("lowStockProducts"),
    stockCostValue: document.getElementById("stockCostValue"),
    potentialSalesValue: document.getElementById("potentialSalesValue"),

    productForm: document.getElementById("productForm"),
    formTitle: document.getElementById("formTitle"),
    productName: document.getElementById("product_name"),
    categoryId: document.getElementById("category_id"),
    description: document.getElementById("description"),
    sellingPrice: document.getElementById("selling_price"),
    buyingPrice: document.getElementById("buying_price"),
    stockQuantity: document.getElementById("stock_quantity"),
    openingStockField: document.getElementById("openingStockField"),
    lowStockLevel: document.getElementById("low_stock_level"),
    saveProductButton: document.getElementById("saveProductButton"),
    cancelEditButton: document.getElementById("cancelEditButton"),
    formMessage: document.getElementById("formMessage"),

    productSearch: document.getElementById("productSearch"),
    productsTableBody: document.getElementById("productsTableBody"),
    tableMessage: document.getElementById("tableMessage"),

    adjustmentForm: document.getElementById("adjustmentForm"),
    adjustmentProductId: document.getElementById("adjustmentProductId"),
    adjustmentQuantity: document.getElementById("adjustmentQuantity"),
    adjustmentReason: document.getElementById("adjustmentReason"),
    saveAdjustmentButton: document.getElementById("saveAdjustmentButton"),
    adjustmentMessage: document.getElementById("adjustmentMessage"),

    historyProductId: document.getElementById("historyProductId"),
    movementTableBody: document.getElementById("movementTableBody"),
    historyMessage: document.getElementById("historyMessage"),
    closeHistoryButton: document.getElementById("closeHistoryButton")
};

/* =========================================
   GENERAL HELPERS
========================================= */

function escapeHTML(value) {
    return String(value ?? "").replace(/[&<>"']/g, character => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#039;"
    })[character]);
}

function formatMoney(value) {
    const amount = Number(value || 0);

    return "KSh " + amount.toLocaleString("en-KE", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    });
}

function formatNumber(value) {
    return Number(value || 0).toLocaleString("en-KE", {
        maximumFractionDigits: 2
    });
}

function formatDate(value) {
    if (!value) return "—";

    const date = new Date(value.replace(" ", "T"));

    if (Number.isNaN(date.getTime())) {
        return value;
    }

    return date.toLocaleString("en-KE", {
        dateStyle: "medium",
        timeStyle: "short"
    });
}

async function apiRequest(url, options = {}) {
    const response = await fetch(url, {
        credentials: "same-origin",
        ...options,
        headers: {
            ...(options.body ? { "Content-Type": "application/json" } : {}),
            ...(options.headers || {})
        }
    });

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

    if (!response.ok) {
        throw new Error(
            data.message ||
            data.error ||
            "The request could not be completed."
        );
    }

    return data;
}

function getArray(data, possibleKeys = []) {
    if (Array.isArray(data)) return data;

    for (const key of possibleKeys) {
        if (Array.isArray(data?.[key])) {
            return data[key];
        }
    }

    return [];
}

function setMessage(element, message, isError = false) {
    if (!element) return;

    element.textContent = message;
    element.style.color = isError ? "#b91c1c" : "#15803d";
}

function setLoading(button, loading, loadingText, normalText) {
    if (!button) return;

    button.disabled = loading;
    button.textContent = loading ? loadingText : normalText;
}

function getProductId(product) {
    return product.id ?? product.product_id;
}

function getProductName(product) {
    return product.product_name ?? product.name ?? "Unnamed product";
}

function getCategoryName(product) {
    return product.category_name ||
        product.category ||
        "Uncategorised";
}

/* =========================================
   ACCOUNT
========================================= */

async function loadAccount() {
    const data = await apiRequest(API.account);

    const user = data.user || data.account || data;
    const business = data.business || user.business || {};

    if (elements.userName) {
        elements.userName.textContent =
            user.full_name || user.name || "Account";
    }

    if (elements.businessName) {
        elements.businessName.textContent =
            business.business_name ||
            business.name ||
            user.business_name ||
            "Your Business";
    }
}

/* =========================================
   CATEGORIES
========================================= */

async function loadCategories() {
    const data = await apiRequest(API.categories);

    categories = getArray(data, ["categories", "data"]);

    if (elements.categoryId) {
        elements.categoryId.innerHTML =
            '<option value="">Select category</option>';

        categories.forEach(category => {
            const id = category.id ?? category.category_id;
            const name = category.category_name || category.name;

            if (id == null || !name) return;

            const option = document.createElement("option");
            option.value = id;
            option.textContent = name;

            elements.categoryId.appendChild(option);
        });
    }
}

/* =========================================
   PRODUCTS
========================================= */

async function loadProducts() {
    if (elements.productsTableBody) {
        elements.productsTableBody.innerHTML =
            '<tr><td colspan="6" class="inventory-empty">Loading products...</td></tr>';
    }

    const data = await apiRequest(API.products);

    products = getArray(data, ["products", "data"]);

    renderProducts();
    updateProductSelectors();
    updateStatistics();

    await loadInventorySummary();
}

function renderProducts() {
    const search = (elements.productSearch?.value || "")
        .trim()
        .toLowerCase();

    const filtered = products.filter(product => {
        const name = getProductName(product).toLowerCase();
        const category = getCategoryName(product).toLowerCase();

        return name.includes(search) || category.includes(search);
    });

    if (!filtered.length) {
        elements.productsTableBody.innerHTML = `
            <tr>
                <td colspan="6" class="inventory-empty">
                    ${products.length
                        ? "No products match your search."
                        : "No products have been added yet."}
                </td>
            </tr>
        `;
        return;
    }

    const grouped = {};

    filtered.forEach(product => {
        const category = getCategoryName(product);

        if (!grouped[category]) {
            grouped[category] = [];
        }

        grouped[category].push(product);
    });

    let html = "";

    Object.keys(grouped).sort().forEach(category => {
        html += `
            <tr class="category-group-row">
                <td colspan="6">${escapeHTML(category)}</td>
            </tr>
        `;

        grouped[category].forEach(product => {
            const id = getProductId(product);
            const name = getProductName(product);
            const stock = Number(product.stock_quantity || 0);
            const lowLevel = Number(product.low_stock_level || 0);
            const isLow = stock <= lowLevel;

            html += `
                <tr>
                    <td><strong>${escapeHTML(name)}</strong></td>
                    <td>${formatMoney(product.buying_price)}</td>
                    <td>${formatMoney(product.selling_price)}</td>
                    <td>${formatNumber(stock)}</td>
                    <td class="${isLow ? "stock-low" : "stock-ok"}">
                        ${isLow ? "Low Stock" : "In Stock"}
                    </td>
                    <td>
                        <div class="inventory-actions">
                            <button
                                type="button"
                                class="edit-button"
                                data-action="edit"
                                data-id="${escapeHTML(id)}"
                            >Edit</button>

                            <button
                                type="button"
                                class="adjust-button"
                                data-action="adjust"
                                data-id="${escapeHTML(id)}"
                            >Adjust</button>

                            <button
                                type="button"
                                class="history-button"
                                data-action="history"
                                data-id="${escapeHTML(id)}"
                            >History</button>

                            <button
                                type="button"
                                class="delete-button"
                                data-action="delete"
                                data-id="${escapeHTML(id)}"
                            >Delete</button>
                        </div>
                    </td>
                </tr>
            `;
        });
    });

    elements.productsTableBody.innerHTML = html;
}

/* =========================================
   SUMMARY
========================================= */

function updateStatistics() {
    const totalProducts = products.length;

    const totalStock = products.reduce(
        (total, product) =>
            total + Number(product.stock_quantity || 0),
        0
    );

    const lowStock = products.filter(product =>
        Number(product.stock_quantity || 0) <=
        Number(product.low_stock_level || 0)
    ).length;

    if (elements.totalProducts) {
        elements.totalProducts.textContent = formatNumber(totalProducts);
    }

    if (elements.totalStock) {
        elements.totalStock.textContent = formatNumber(totalStock);
    }

    if (elements.lowStockProducts) {
        elements.lowStockProducts.textContent = formatNumber(lowStock);
    }

    const costValue = products.reduce(
        (total, product) =>
            total +
            Number(product.stock_quantity || 0) *
            Number(product.buying_price || 0),
        0
    );

    const salesValue = products.reduce(
        (total, product) =>
            total +
            Number(product.stock_quantity || 0) *
            Number(product.selling_price || 0),
        0
    );

    if (elements.stockCostValue) {
        elements.stockCostValue.textContent = formatMoney(costValue);
    }

    if (elements.potentialSalesValue) {
        elements.potentialSalesValue.textContent = formatMoney(salesValue);
    }
}

async function loadInventorySummary() {
    try {
        const summary = await apiRequest(API.summary);
        const data = summary.summary || summary;

        const cost = data.stock_cost_value ??
            data.total_cost_value ??
            data.stock_value;

        const sales = data.potential_sales_value ??
            data.total_sales_value ??
            data.potential_value;

        if (cost !== undefined && elements.stockCostValue) {
            elements.stockCostValue.textContent = formatMoney(cost);
        }

        if (sales !== undefined && elements.potentialSalesValue) {
            elements.potentialSalesValue.textContent = formatMoney(sales);
        }

        if (data.total_products !== undefined && elements.totalProducts) {
            elements.totalProducts.textContent =
                formatNumber(data.total_products);
        }

        if (data.total_stock_units !== undefined && elements.totalStock) {
            elements.totalStock.textContent =
                formatNumber(data.total_stock_units);
        }

        if (data.low_stock_products !== undefined && elements.lowStockProducts) {
            elements.lowStockProducts.textContent =
                formatNumber(data.low_stock_products);
        }
    } catch (error) {
        // The product list still provides locally calculated summary values.
        console.warn("Inventory summary endpoint:", error.message);
    }
}

/* =========================================
   PRODUCT SELECTORS
========================================= */

function updateProductSelectors() {
    const selectors = [
        elements.adjustmentProductId,
        elements.historyProductId
    ];

    selectors.forEach(select => {
        if (!select) return;

        const previousValue = select.value;

        const placeholder = select === elements.adjustmentProductId
            ? "Select a product"
            : "Select a product to view history";

        select.innerHTML = "";

        const firstOption = document.createElement("option");
        firstOption.value = "";
        firstOption.textContent = placeholder;
        select.appendChild(firstOption);

        products.forEach(product => {
            const option = document.createElement("option");
            option.value = getProductId(product);
            option.textContent = getProductName(product);

            select.appendChild(option);
        });

        if (
            previousValue &&
            products.some(product =>
                String(getProductId(product)) === String(previousValue)
            )
        ) {
            select.value = previousValue;
        }
    });
}

/* =========================================
   ADD / EDIT PRODUCT
========================================= */

function resetProductForm() {
    editingProductId = null;

    elements.productForm.reset();

    elements.stockQuantity.disabled = false;
    elements.openingStockField.hidden = false;

    elements.formTitle.textContent = "Add New Product";
    elements.saveProductButton.textContent = "Add Product";
    elements.cancelEditButton.hidden = true;

    elements.stockQuantity.value = "0";
    elements.buyingPrice.value = "0";
    elements.lowStockLevel.value = "5";

    setMessage(elements.formMessage, "");
}

function startEditProduct(productId) {
    const product = products.find(
        item => String(getProductId(item)) === String(productId)
    );

    if (!product) {
        setMessage(elements.formMessage, "Product not found.", true);
        return;
    }

    editingProductId = productId;

    elements.productName.value = product.product_name || "";
    elements.categoryId.value = product.category_id || "";
    elements.description.value = product.description || "";
    elements.sellingPrice.value = product.selling_price ?? 0;
    elements.buyingPrice.value = product.buying_price ?? 0;
    elements.lowStockLevel.value = product.low_stock_level ?? 0;

    // Stock must only change through the adjustment endpoint.
    elements.stockQuantity.value = product.stock_quantity ?? 0;
    elements.stockQuantity.disabled = true;
    elements.openingStockField.hidden = true;

    elements.formTitle.textContent = "Edit Product";
    elements.saveProductButton.textContent = "Save Product Changes";
    elements.cancelEditButton.hidden = false;

    setMessage(
        elements.formMessage,
        "Editing product details. Use Stock Adjustment to change its quantity."
    );

    elements.productForm.scrollIntoView({
        behavior: "smooth",
        block: "start"
    });
}

async function saveProduct(event) {
    event.preventDefault();

    const isEditing = editingProductId !== null;

    const payload = {
        product_name: elements.productName.value.trim(),
        category_id: elements.categoryId.value || null,
        description: elements.description.value.trim(),
        selling_price: Number(elements.sellingPrice.value),
        buying_price: Number(elements.buyingPrice.value || 0),
        low_stock_level: Number(elements.lowStockLevel.value || 0)
    };

    if (!payload.product_name) {
        setMessage(elements.formMessage, "Enter a product name.", true);
        return;
    }

    if (
        !Number.isFinite(payload.selling_price) ||
        payload.selling_price < 0 ||
        !Number.isFinite(payload.buying_price) ||
        payload.buying_price < 0 ||
        !Number.isFinite(payload.low_stock_level) ||
        payload.low_stock_level < 0
    ) {
        setMessage(elements.formMessage, "Enter valid product prices and stock alert level.", true);
        return;
    }

    if (!isEditing) {
        const openingStock = Number(elements.stockQuantity.value);

        if (!Number.isFinite(openingStock) || openingStock < 0) {
            setMessage(elements.formMessage, "Enter a valid opening stock quantity.", true);
            return;
        }

        payload.stock_quantity = openingStock;
    }

    const url = isEditing
        ? `${API.products}/${encodeURIComponent(editingProductId)}`
        : API.products;

    const method = isEditing ? "PUT" : "POST";

    setLoading(
        elements.saveProductButton,
        true,
        "Saving...",
        isEditing ? "Save Product Changes" : "Add Product"
    );

    try {
        await apiRequest(url, {
            method,
            body: JSON.stringify(payload)
        });

        resetProductForm();

        setMessage(
            elements.formMessage,
            isEditing
                ? "Product details updated successfully."
                : "Product added successfully."
        );

        await loadProducts();

    } catch (error) {
        setMessage(elements.formMessage, error.message, true);
    } finally {
        setLoading(
            elements.saveProductButton,
            false,
            "Saving...",
            editingProductId !== null
                ? "Save Product Changes"
                : "Add Product"
        );
    }
}

/* =========================================
   STOCK ADJUSTMENTS
========================================= */

function startAdjustment(productId) {
    const product = products.find(
        item => String(getProductId(item)) === String(productId)
    );

    if (!product) return;

    elements.adjustmentProductId.value = getProductId(product);
    elements.adjustmentQuantity.value = "";
    elements.adjustmentReason.value = "";

    setMessage(
        elements.adjustmentMessage,
        `Selected ${getProductName(product)}. Current stock: ${formatNumber(product.stock_quantity)}`
    );

    elements.stockAdjustmentPanel.scrollIntoView({
        behavior: "smooth",
        block: "start"
    });

    elements.adjustmentQuantity.focus();
}

async function saveAdjustment(event) {
    event.preventDefault();

    const productId = elements.adjustmentProductId.value;
    const quantityChange = Number(elements.adjustmentQuantity.value);
    const reason = elements.adjustmentReason.value.trim();

    if (!productId) {
        setMessage(elements.adjustmentMessage, "Select a product.", true);
        return;
    }

    if (
        !Number.isFinite(quantityChange) ||
        quantityChange === 0
    ) {
        setMessage(
            elements.adjustmentMessage,
            "Enter a valid quantity change. It cannot be zero.",
            true
        );
        return;
    }

    if (!reason) {
        setMessage(elements.adjustmentMessage, "Enter the reason for this adjustment.", true);
        return;
    }

    const product = products.find(
        item => String(getProductId(item)) === String(productId)
    );

    const currentStock = Number(product?.stock_quantity || 0);
    const newStock = currentStock + quantityChange;

    if (newStock < 0) {
        setMessage(
            elements.adjustmentMessage,
            "This adjustment would make stock negative. Check the quantity.",
            true
        );
        return;
    }

    setLoading(
        elements.saveAdjustmentButton,
        true,
        "Saving adjustment...",
        "Save Stock Adjustment"
    );

    try {
        await apiRequest(
            `${API.products}/${encodeURIComponent(productId)}/adjustments`,
            {
                method: "POST",
                body: JSON.stringify({
                    quantity_change: quantityChange,
                    reason
                })
            }
        );

        elements.adjustmentQuantity.value = "";
        elements.adjustmentReason.value = "";

        setMessage(
            elements.adjustmentMessage,
            "Stock adjustment recorded successfully."
        );

        await loadProducts();

        if (
            elements.historyProductId.value === String(productId)
        ) {
            await loadMovementHistory(productId);
        }

    } catch (error) {
        setMessage(elements.adjustmentMessage, error.message, true);
    } finally {
        setLoading(
            elements.saveAdjustmentButton,
            false,
            "Saving adjustment...",
            "Save Stock Adjustment"
        );
    }
}

/* =========================================
   STOCK MOVEMENT HISTORY
========================================= */

async function loadMovementHistory(productId) {
    if (!productId) {
        elements.movementTableBody.innerHTML = `
            <tr>
                <td colspan="7" class="inventory-empty">
                    Select a product to view its stock history.
                </td>
            </tr>
        `;

        elements.closeHistoryButton.hidden = true;
        return;
    }

    elements.historyProductId.value = productId;
    elements.closeHistoryButton.hidden = false;

    elements.movementTableBody.innerHTML = `
        <tr>
            <td colspan="7" class="inventory-empty">
                Loading stock history...
            </td>
        </tr>
    `;

    setMessage(elements.historyMessage, "");

    try {
        const data = await apiRequest(
            `${API.products}/${encodeURIComponent(productId)}/movements`
        );

        const movements = getArray(data, [
            "movements",
            "history",
            "data"
        ]);

        if (!movements.length) {
            elements.movementTableBody.innerHTML = `
                <tr>
                    <td colspan="7" class="inventory-empty">
                        No stock movements have been recorded for this product.
                    </td>
                </tr>
            `;
            return;
        }

        elements.movementTableBody.innerHTML = movements.map(movement => {
            const change = Number(
                movement.quantity_changed ??
                movement.quantity_change ??
                0
            );

            const movementType = String(
                movement.movement_type || "adjustment"
            ).replaceAll("_", " ");

            return `
                <tr>
                    <td>${escapeHTML(formatDate(movement.created_at))}</td>
                    <td>${escapeHTML(movementType)}</td>
                    <td>${formatNumber(movement.quantity_before)}</td>
                    <td class="${change >= 0 ? "movement-positive" : "movement-negative"}">
                        ${change > 0 ? "+" : ""}${formatNumber(change)}
                    </td>
                    <td>${formatNumber(movement.quantity_after)}</td>
                    <td>${escapeHTML(movement.reason || "—")}</td>
                    <td>${escapeHTML(movement.recorded_by || movement.full_name || "—")}</td>
                </tr>
            `;
        }).join("");

    } catch (error) {
        elements.movementTableBody.innerHTML = `
            <tr>
                <td colspan="7" class="inventory-empty">
                    Could not load stock history.
                </td>
            </tr>
        `;

        setMessage(elements.historyMessage, error.message, true);
    }
}

/* =========================================
   DELETE PRODUCT
========================================= */

async function deleteProduct(productId) {
    const product = products.find(
        item => String(getProductId(item)) === String(productId)
    );

    if (!product) return;

    const confirmed = window.confirm(
        `Delete "${getProductName(product)}"?\n\nProducts with stock or transaction history cannot be deleted.`
    );

    if (!confirmed) return;

    try {
        await apiRequest(
            `${API.products}/${encodeURIComponent(productId)}`,
            { method: "DELETE" }
        );

        setMessage(elements.tableMessage, "Product deleted successfully.");
        await loadProducts();

    } catch (error) {
        setMessage(elements.tableMessage, error.message, true);
    }
}

/* =========================================
   TABLE ACTIONS
========================================= */

function handleProductTableClick(event) {
    const button = event.target.closest("button[data-action]");

    if (!button) return;

    const action = button.dataset.action;
    const productId = button.dataset.id;

    if (!productId) return;

    if (action === "edit") {
        startEditProduct(productId);
    } else if (action === "adjust") {
        startAdjustment(productId);
    } else if (action === "history") {
        loadMovementHistory(productId);
    } else if (action === "delete") {
        deleteProduct(productId);
    }
}

/* =========================================
   LOGOUT
========================================= */

async function logout() {
    try {
        await apiRequest("/api/auth/logout", {
            method: "POST"
        });
    } catch (error) {
        console.warn("Logout request:", error.message);
    }

    window.location.href = "/login.html";
}

/* =========================================
   EVENT LISTENERS
========================================= */

function registerEvents() {
    elements.productForm.addEventListener("submit", saveProduct);

    elements.cancelEditButton.addEventListener("click", resetProductForm);

    elements.productSearch.addEventListener("input", renderProducts);

    elements.productsTableBody.addEventListener(
        "click",
        handleProductTableClick
    );

    elements.adjustmentForm.addEventListener(
        "submit",
        saveAdjustment
    );

    elements.historyProductId.addEventListener("change", event => {
        loadMovementHistory(event.target.value);
    });

    elements.closeHistoryButton.addEventListener("click", () => {
        elements.historyProductId.value = "";
        loadMovementHistory("");
    });

    elements.logoutButton.addEventListener("click", logout);
}

/* =========================================
   START INVENTORY
========================================= */

async function initializeInventory() {
    registerEvents();

    try {
        await loadAccount();
        await loadCategories();
        await loadProducts();

    } catch (error) {
        console.error("Inventory initialization failed:", error);

        if (elements.productsTableBody) {
            elements.productsTableBody.innerHTML = `
                <tr>
                    <td colspan="6" class="inventory-empty">
                        Inventory could not load. ${escapeHTML(error.message)}
                    </td>
                </tr>
            `;
        }
    }
}

document.addEventListener("DOMContentLoaded", initializeInventory);
