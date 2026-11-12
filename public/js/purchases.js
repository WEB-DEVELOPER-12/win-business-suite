
document.addEventListener("DOMContentLoaded", () => {
    const purchaseForm = document.getElementById("purchaseForm");
    const purchaseItems = document.getElementById("purchaseItems");
    const addItemButton = document.getElementById("addItemButton");
    const supplierSelect = document.getElementById("supplierId");
    const purchaseDateInput = document.getElementById("purchaseDate");
    const purchaseTotal = document.getElementById("purchaseTotal");
    const purchaseMessage = document.getElementById("purchaseMessage");
    const purchasesTableBody = document.getElementById("purchasesTableBody");
    const purchaseSearch = document.getElementById("purchaseSearch");
    const savePurchaseButton = document.getElementById("savePurchaseButton");

    let products = [];
    let suppliers = [];
    let purchases = [];

    function getTodayDate() {
        const today = new Date();
        const year = today.getFullYear();
        const month = String(today.getMonth() + 1).padStart(2, "0");
        const day = String(today.getDate()).padStart(2, "0");

        return `${year}-${month}-${day}`;
    }

    purchaseDateInput.value = getTodayDate();
    purchaseDateInput.max = getTodayDate();

    const formatMoney = amount =>
        "KSh " + Number(amount || 0).toLocaleString("en-KE", {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2
        });

    const escapeHTML = value =>
        String(value ?? "").replace(/[&<>"']/g, character => ({
            "&": "&amp;",
            "<": "&lt;",
            ">": "&gt;",
            '"': "&quot;",
            "'": "&#039;"
        })[character]);

    function showMessage(message, type = "") {
        purchaseMessage.textContent = message;
        purchaseMessage.className = "purchase-message " + type;
    }

    async function apiRequest(url, options = {}) {
        const response = await fetch(url, {
            credentials: "same-origin",
            ...options,
            headers: {
                ...(options.headers || {})
            }
        });

        let data;

        try {
            data = await response.json();
        } catch {
            throw new Error("The server returned an invalid response.");
        }

        if (!response.ok || data.success === false) {
            if (response.status === 401) {
                window.location.href = "/login.html";
                throw new Error("Please log in again.");
            }

            throw new Error(data.message || "Something went wrong.");
        }

        return data;
    }

    // LOAD USER AND BUSINESS INFORMATION
    async function loadUser() {
        try {
            const data = await apiRequest("/api/auth/me");
            const user = data.user || data;

            document.getElementById("userName").textContent =
                user.full_name ||
                user.name ||
                user.username ||
                user.email ||
                "Account";

            document.getElementById("businessName").textContent =
                user.business_name ||
                user.business?.business_name ||
                user.business?.name ||
                user.businessName ||
                "Your Business";
        } catch (error) {
            console.error("Could not load account information:", error);
        }
    }

    // LOG OUT
    document.getElementById("logoutButton").addEventListener("click", async () => {
        try {
            await fetch("/api/auth/logout", {
                method: "POST",
                credentials: "same-origin"
            });
        } finally {
            window.location.href = "/login.html";
        }
    });

    // LOAD PRODUCTS AND SUPPLIERS
    async function loadOptions() {
        const data = await apiRequest("/api/purchases/options");

        products = data.products || [];
        suppliers = data.suppliers || [];

        supplierSelect.innerHTML =
            '<option value="">No supplier selected</option>';

        suppliers.forEach(supplier => {
            const option = document.createElement("option");
            option.value = supplier.id;
            option.textContent =
                supplier.supplier_name +
                (supplier.phone ? " - " + supplier.phone : "");

            supplierSelect.appendChild(option);
        });

        purchaseItems.innerHTML = "";

        if (products.length === 0) {
            purchaseItems.innerHTML =
                '<p class="purchase-empty">No products found. Add products in Inventory first.</p>';

            savePurchaseButton.disabled = true;
            addItemButton.disabled = true;
            return;
        }

        savePurchaseButton.disabled = false;
        addItemButton.disabled = false;

        addPurchaseItem();
    }

    // ADD A PRODUCT ROW
    function addPurchaseItem() {
        if (products.length === 0) return;

        const row = document.createElement("div");
        row.className = "purchase-item";

        row.innerHTML = `
            <div class="product-field">
                <label>Product *</label>
                <select class="item-product" required>
                    <option value="">Select product</option>
                    ${products.map(product => `
                        <option value="${product.id}">
                            ${escapeHTML(product.product_name)}
                            (Stock: ${Number(product.stock_quantity)})
                        </option>
                    `).join("")}
                </select>
            </div>

            <div>
                <label>Quantity *</label>
                <input
                    type="number"
                    class="item-quantity"
                    min="0.01"
                    step="0.01"
                    value="1"
                    required
                >
            </div>

            <div>
                <label>Unit Cost (KSh) *</label>
                <input
                    type="number"
                    class="item-cost"
                    min="0"
                    step="0.01"
                    value="0"
                    required
                >
            </div>

            <button type="button" class="remove-item">
                Remove
            </button>
        `;

        purchaseItems.appendChild(row);

        const productSelect = row.querySelector(".item-product");
        const quantityInput = row.querySelector(".item-quantity");
        const costInput = row.querySelector(".item-cost");
        const removeButton = row.querySelector(".remove-item");

        productSelect.addEventListener("change", () => {
            const selectedId = Number(productSelect.value);

            if (selectedId) {
                const duplicate = [...purchaseItems.querySelectorAll(".item-product")]
                    .some(select =>
                        select !== productSelect &&
                        Number(select.value) === selectedId
                    );

                if (duplicate) {
                    alert("This product is already in the purchase.");
                    productSelect.value = "";
                    costInput.value = "0";
                    updateTotal();
                    return;
                }

                const product = products.find(item => item.id === selectedId);

                if (product) {
                    costInput.value = Number(product.buying_price || 0);
                }
            } else {
                costInput.value = "0";
            }

            updateTotal();
        });

        quantityInput.addEventListener("input", updateTotal);
        costInput.addEventListener("input", updateTotal);

        removeButton.addEventListener("click", () => {
            if (purchaseItems.querySelectorAll(".purchase-item").length === 1) {
                alert("At least one purchase item is required.");
                return;
            }

            row.remove();
            updateTotal();
        });

        updateTotal();
    }

    // CALCULATE PURCHASE TOTAL
    function updateTotal() {
        let total = 0;

        purchaseItems.querySelectorAll(".purchase-item").forEach(row => {
            const quantity = Number(
                row.querySelector(".item-quantity").value
            );

            const cost = Number(
                row.querySelector(".item-cost").value
            );

            if (
                Number.isFinite(quantity) &&
                Number.isFinite(cost) &&
                quantity > 0 &&
                cost >= 0
            ) {
                total += quantity * cost;
            }
        });

        purchaseTotal.textContent = formatMoney(total);
    }

    addItemButton.addEventListener("click", addPurchaseItem);

    // LOAD PURCHASE HISTORY
    async function loadPurchaseHistory() {
        try {
            const data = await apiRequest("/api/purchases");

            purchases = data.purchases || [];

            updatePurchaseStats();
            renderPurchases(purchases);
        } catch (error) {
            purchasesTableBody.innerHTML = `
                <tr>
                    <td colspan="5" class="purchase-empty">
                        Could not load purchase history.
                    </td>
                </tr>
            `;

            document.getElementById("historyMessage").textContent =
                error.message;
        }
    }

    // UPDATE DASHBOARD STATISTICS
    function updatePurchaseStats() {
        const totalValue = purchases.reduce(
            (sum, purchase) =>
                sum + Number(purchase.total_amount || 0),
            0
        );

        const sevenDaysAgo = Date.now() - (7 * 24 * 60 * 60 * 1000);

        const recentCount = purchases.filter(purchase => {
            const date = new Date(purchase.purchase_date).getTime();
            return Number.isFinite(date) && date >= sevenDaysAgo;
        }).length;

        document.getElementById("totalPurchases").textContent =
            purchases.length;

        document.getElementById("totalPurchaseValue").textContent =
            formatMoney(totalValue);

        document.getElementById("recentPurchases").textContent =
            recentCount;
    }

    // DISPLAY PURCHASE HISTORY
    function renderPurchases(list) {
        if (list.length === 0) {
            purchasesTableBody.innerHTML = `
                <tr>
                    <td colspan="5" class="purchase-empty">
                        No purchases found.
                    </td>
                </tr>
            `;
            return;
        }

        purchasesTableBody.innerHTML = list.map(purchase => {
            const date = purchase.purchase_date
                ? new Date(purchase.purchase_date).toLocaleDateString("en-KE")
                : "N/A";

            return `
                <tr>
                    <td>${escapeHTML(purchase.purchase_number)}</td>
                    <td>${escapeHTML(purchase.supplier_name || "Not specified")}</td>
                    <td>${escapeHTML(date)}</td>
                    <td>${formatMoney(purchase.total_amount)}</td>
                    <td>
                        <button
                            type="button"
                            class="view-button"
                            data-id="${Number(purchase.id)}"
                        >
                            View
                        </button>
                    </td>
                </tr>
            `;
        }).join("");
    }

    // SEARCH PURCHASE HISTORY
    purchaseSearch.addEventListener("input", () => {
        const search = purchaseSearch.value.trim().toLowerCase();

        const filtered = purchases.filter(purchase =>
            String(purchase.purchase_number || "").toLowerCase().includes(search) ||
            String(purchase.supplier_name || "").toLowerCase().includes(search)
        );

        renderPurchases(filtered);
    });

    // VIEW PURCHASE DETAILS
    purchasesTableBody.addEventListener("click", async event => {
        const button = event.target.closest(".view-button");

        if (!button) return;

        const purchaseId = button.dataset.id;

        button.disabled = true;

        try {
            const data = await apiRequest(
                `/api/purchases/${encodeURIComponent(purchaseId)}`
            );

            const purchase = data.purchase;
            const items = data.items || [];

            const details = items.map(item =>
                `${item.product_name} | Quantity: ${item.quantity} | Unit cost: ${formatMoney(item.unit_cost)} | Total: ${formatMoney(item.line_total)}`
            ).join("\n");

            alert(
                `PURCHASE DETAILS\n\n` +
                `Purchase: ${purchase.purchase_number}\n` +
                `Supplier: ${purchase.supplier_name || "Not specified"}\n` +
                `Date: ${purchase.purchase_date || "N/A"}\n\n` +
                `ITEMS\n${details}\n\n` +
                `TOTAL: ${formatMoney(purchase.total_amount)}\n\n` +
                `Notes: ${purchase.notes || "None"}`
            );
        } catch (error) {
            alert(error.message);
        } finally {
            button.disabled = false;
        }
    });

    // SAVE NEW PURCHASE
    purchaseForm.addEventListener("submit", async event => {
        event.preventDefault();

        showMessage("");

        const purchaseDate = purchaseDateInput.value;

        if (!purchaseDate) {
            showMessage("Please select a purchase date.", "error");
            purchaseDateInput.focus();
            return;
        }

        if (purchaseDate > getTodayDate()) {
            showMessage("Purchase date cannot be in the future.", "error");
            purchaseDateInput.focus();
            return;
        }

        const rows = [
            ...purchaseItems.querySelectorAll(".purchase-item")
        ];

        const items = [];

        for (const row of rows) {
            const productId = Number(
                row.querySelector(".item-product").value
            );

            const quantity = Number(
                row.querySelector(".item-quantity").value
            );

            const unitCost = Number(
                row.querySelector(".item-cost").value
            );

            if (
                !Number.isInteger(productId) ||
                productId <= 0 ||
                !Number.isFinite(quantity) ||
                quantity <= 0 ||
                !Number.isFinite(unitCost) ||
                unitCost < 0
            ) {
                showMessage(
                    "Please enter valid product, quantity and unit cost details.",
                    "error"
                );
                return;
            }

            items.push({
                product_id: productId,
                quantity,
                unit_cost: unitCost
            });
        }

        if (items.length === 0) {
            showMessage("Add at least one product.", "error");
            return;
        }

        const supplierId = supplierSelect.value;

        const purchaseData = {
            supplier_id: supplierId ? Number(supplierId) : null,
            purchase_date: purchaseDate,
            notes: document.getElementById("purchaseNotes").value.trim(),
            items
        };

        const confirmed = confirm(
            "Are you sure you want to record this purchase?\n\n" +
            "Date: " + purchaseDate + "\n" +
            "Total: " + purchaseTotal.textContent
        );

        if (!confirmed) return;

        savePurchaseButton.disabled = true;
        savePurchaseButton.textContent = "Saving Purchase...";

        try {
            const result = await apiRequest("/api/purchases", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify(purchaseData)
            });

            showMessage(
                `Purchase recorded successfully! Purchase number: ${result.purchase_number}`,
                "success"
            );

            purchaseForm.reset();
            purchaseDateInput.value = getTodayDate();
            purchaseItems.innerHTML = "";
            addPurchaseItem();
            updateTotal();

            await Promise.all([
                loadOptions(),
                loadPurchaseHistory()
            ]);

        } catch (error) {
            showMessage(error.message, "error");
        } finally {
            savePurchaseButton.disabled = false;
            savePurchaseButton.textContent = "Record Purchase";
        }
    });

    // INITIALIZE PAGE
    async function initializePage() {
        await loadUser();

        try {
            await Promise.all([
                loadOptions(),
                loadPurchaseHistory()
            ]);
        } catch (error) {
            showMessage(error.message, "error");
        }
    }

    initializePage();
});
