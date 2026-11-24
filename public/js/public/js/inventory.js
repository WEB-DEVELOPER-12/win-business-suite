
const userName = document.getElementById("userName");
const businessName = document.getElementById("businessName");
const logoutButton = document.getElementById("logoutButton");

const productForm = document.getElementById("productForm");
const saveProductButton = document.getElementById("saveProductButton");
const cancelEditButton = document.getElementById("cancelEditButton");
const formMessage = document.getElementById("formMessage");
const tableMessage = document.getElementById("tableMessage");
const productsTableBody = document.getElementById("productsTableBody");
const productSearch = document.getElementById("productSearch");
const categorySelect = document.getElementById("category_id");

let products = [];
let categories = [];
let editingProductId = null;

function escapeHTML(value) {
    return String(value ?? "").replace(/[&<>"']/g, character => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;"
    })[character]);
}

function formatMoney(value) {
    return Number(value).toLocaleString("en-KE", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    });
}

// LOAD ACCOUNT
async function loadAccount() {
    const response = await fetch("/api/auth/me");

    if (response.status === 401) {
        window.location.href = "/login.html";
        return false;
    }

    const result = await response.json();

    if (!response.ok || !result.success) {
        throw new Error("Could not load account information.");
    }

    userName.textContent = result.user.full_name;
    businessName.textContent = result.user.business_name;

    return true;
}

// LOAD CATEGORIES
async function loadCategories() {
    categorySelect.innerHTML = `
        <option value="">Loading categories...</option>
    `;

    const response = await fetch("/api/categories");
    const result = await response.json();

    if (!response.ok || !result.success) {
        throw new Error(result.message || "Could not load categories.");
    }

    categories = result.categories || [];

    categorySelect.innerHTML = `
        <option value="">Uncategorised</option>
        ${categories.map(category => `
            <option value="${category.id}">
                ${escapeHTML(category.name)}
            </option>
        `).join("")}
    `;
}

// LOAD PRODUCTS
async function loadProducts() {
    productsTableBody.innerHTML = `
        <tr>
            <td colspan="6" class="inventory-empty">
                Loading products...
            </td>
        </tr>
    `;

    const response = await fetch("/api/inventory");
    const result = await response.json();

    if (!response.ok || !result.success) {
        throw new Error(result.message || "Could not load products.");
    }

    products = result.products || [];

    renderProducts();
    updateStatistics();
}

// DISPLAY PRODUCTS GROUPED BY CATEGORY
function renderProducts() {
    const search = productSearch.value.trim().toLowerCase();

    const filteredProducts = products.filter(product => {
        const productName = String(product.product_name || "").toLowerCase();
        const categoryName = String(product.category_name || "Uncategorised").toLowerCase();

        return productName.includes(search) || categoryName.includes(search);
    });

    if (filteredProducts.length === 0) {
        productsTableBody.innerHTML = `
            <tr>
                <td colspan="6" class="inventory-empty">
                    No products found.
                </td>
            </tr>
        `;
        return;
    }

    const groupedProducts = {};

    filteredProducts.forEach(product => {
        const categoryName = product.category_name || "Uncategorised";

        if (!groupedProducts[categoryName]) {
            groupedProducts[categoryName] = [];
        }

        groupedProducts[categoryName].push(product);
    });

    productsTableBody.innerHTML = Object.entries(groupedProducts)
        .map(([categoryName, categoryProducts]) => `
            <tr class="category-group-row">
                <td colspan="6">
                    ${escapeHTML(categoryName)}
                    (${categoryProducts.length} products)
                </td>
            </tr>

            ${categoryProducts.map(product => {
                const isLowStock =
                    Number(product.stock_quantity) <= Number(product.low_stock_level);

                return `
                    <tr>
                        <td>${escapeHTML(product.product_name)}</td>

                        <td>KSh ${formatMoney(product.buying_price)}</td>

                        <td>KSh ${formatMoney(product.selling_price)}</td>

                        <td>${formatMoney(product.stock_quantity)}</td>

                        <td class="${isLowStock ? "stock-low" : "stock-ok"}">
                            ${isLowStock ? "Low Stock" : "In Stock"}
                        </td>

                        <td>
                            <div class="inventory-actions">
                                <button class="edit-button"
                                    data-action="edit"
                                    data-id="${product.id}">
                                    Edit
                                </button>

                                <button class="delete-button"
                                    data-action="delete"
                                    data-id="${product.id}">
                                    Delete
                                </button>
                            </div>
                        </td>
                    </tr>
                `;
            }).join("")}
        `).join("");
}

// UPDATE STATISTICS
function updateStatistics() {
    document.getElementById("totalProducts").textContent =
        products.length;

    const totalStock = products.reduce(
        (total, product) => total + Number(product.stock_quantity),
        0
    );

    const lowStock = products.filter(product =>
        Number(product.stock_quantity) <= Number(product.low_stock_level)
    ).length;

    document.getElementById("totalStock").textContent =
        formatMoney(totalStock);

    document.getElementById("lowStockProducts").textContent =
        lowStock;
}

// RESET FORM
function resetForm() {
    productForm.reset();
    editingProductId = null;

    categorySelect.value = "";

    document.getElementById("buying_price").value = 0;
    document.getElementById("stock_quantity").value = 0;
    document.getElementById("low_stock_level").value = 5;

    document.getElementById("formTitle").textContent = "Add New Product";
    saveProductButton.textContent = "Add Product";
    cancelEditButton.hidden = true;
    formMessage.textContent = "";
}

// ADD OR UPDATE PRODUCT
productForm.addEventListener("submit", async event => {
    event.preventDefault();

    const productData = {
        product_name: document.getElementById("product_name").value.trim(),
        category_id: categorySelect.value,
        description: document.getElementById("description").value.trim(),
        selling_price: document.getElementById("selling_price").value,
        buying_price: document.getElementById("buying_price").value,
        stock_quantity: document.getElementById("stock_quantity").value,
        low_stock_level: document.getElementById("low_stock_level").value
    };

    saveProductButton.disabled = true;
    saveProductButton.textContent = "Saving...";
    formMessage.textContent = "";

    try {
        const url = editingProductId
            ? `/api/inventory/${editingProductId}`
            : "/api/inventory";

        const method = editingProductId ? "PUT" : "POST";

        const response = await fetch(url, {
            method,
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify(productData)
        });

        const result = await response.json();

        if (!response.ok || !result.success) {
            throw new Error(result.message || "Could not save product.");
        }

        formMessage.style.color = "green";
        formMessage.textContent = result.message;

        resetForm();

        await loadProducts();

    } catch (error) {
        formMessage.style.color = "red";
        formMessage.textContent = error.message;

    } finally {
        saveProductButton.disabled = false;

        saveProductButton.textContent = editingProductId
            ? "Update Product"
            : "Add Product";
    }
});

// EDIT AND DELETE BUTTONS
productsTableBody.addEventListener("click", async event => {
    const button = event.target.closest("button[data-action]");

    if (!button) return;

    const productId = Number(button.dataset.id);

    const product = products.find(item => item.id === productId);

    if (!product) return;

    if (button.dataset.action === "edit") {
        editingProductId = product.id;

        document.getElementById("product_name").value =
            product.product_name;

        categorySelect.value = product.category_id
            ? String(product.category_id)
            : "";

        document.getElementById("description").value =
            product.description || "";

        document.getElementById("selling_price").value =
            product.selling_price;

        document.getElementById("buying_price").value =
            product.buying_price;

        document.getElementById("stock_quantity").value =
            product.stock_quantity;

        document.getElementById("low_stock_level").value =
            product.low_stock_level;

        document.getElementById("formTitle").textContent = "Edit Product";
        saveProductButton.textContent = "Update Product";
        cancelEditButton.hidden = false;

        formMessage.textContent = "Editing " + product.product_name;

        window.scrollTo({
            top: 0,
            behavior: "smooth"
        });
    }

    if (button.dataset.action === "delete") {
        const confirmed = confirm(
            `Are you sure you want to delete ${product.product_name}?`
        );

        if (!confirmed) return;

        button.disabled = true;

        try {
            const response = await fetch(
                `/api/inventory/${productId}`,
                { method: "DELETE" }
            );

            const result = await response.json();

            if (!response.ok || !result.success) {
                throw new Error(result.message || "Could not delete product.");
            }

            tableMessage.style.color = "green";
            tableMessage.textContent = result.message;

            if (editingProductId === productId) {
                resetForm();
            }

            await loadProducts();

        } catch (error) {
            tableMessage.style.color = "red";
            tableMessage.textContent = error.message;

        } finally {
            button.disabled = false;
        }
    }
});

// CANCEL EDIT
cancelEditButton.addEventListener("click", resetForm);

// SEARCH PRODUCTS
productSearch.addEventListener("input", renderProducts);

// LOG OUT
logoutButton.addEventListener("click", async () => {
    logoutButton.disabled = true;

    try {
        const response = await fetch("/api/auth/logout", {
            method: "POST"
        });

        const result = await response.json();

        if (response.ok && result.success) {
            window.location.href = "/login.html";
            return;
        }

        alert(result.message || "Could not log out.");

    } catch (error) {
        alert("Unable to connect to the server.");

    } finally {
        logoutButton.disabled = false;
    }
});

// INITIALIZE INVENTORY
async function initializeInventory() {
    try {
        const authenticated = await loadAccount();

        if (!authenticated) return;

        await loadCategories();
        await loadProducts();

    } catch (error) {
        console.error(error);

        productsTableBody.innerHTML = `
            <tr>
                <td colspan="6" class="inventory-empty">
                    ${escapeHTML(error.message)}
                </td>
            </tr>
        `;

        formMessage.style.color = "red";
        formMessage.textContent = error.message;
    }
}

initializeInventory();
