
const API_URL = "/api/categories";

let categories = [];

const categoryList = document.getElementById("categoryList");
const categoryModal = document.getElementById("categoryModal");
const categoryForm = document.getElementById("categoryForm");
const categoryMessage = document.getElementById("categoryMessage");

const categoryName = document.getElementById("categoryName");
const categoryDescription = document.getElementById("categoryDescription");
const categoryIcon = document.getElementById("categoryIcon");
const categoryId = document.getElementById("categoryId");
const parentCategory = document.getElementById("parentCategory");

const addCategoryButton = document.getElementById("addCategoryButton");
const cancelCategoryButton = document.getElementById("cancelCategoryButton");
const categorySearch = document.getElementById("categorySearch");
const categoryFilter = document.getElementById("categoryFilter");

function escapeHTML(value = "") {
    return String(value).replace(/[&<>"']/g, character => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#039;"
    })[character]);
}

async function apiRequest(url, options = {}) {
    const response = await fetch(url, {
        credentials: "same-origin",
        ...options,
        headers: {
            "Content-Type": "application/json",
            ...(options.headers || {})
        }
    });

    const data = await response.json().catch(() => ({}));

    if (response.status === 401) {
        window.location.href = "/login.html";
        throw new Error("Please log in again.");
    }

    if (!response.ok || data.success === false) {
        throw new Error(data.message || "Something went wrong.");
    }

    return data;
}

function getCategoryType(category) {
    return category.category_type || "custom";
}

function getParentId(category) {
    return category.parent_id ?? null;
}

function getMainCategories() {
    return categories.filter(category => !getParentId(category));
}

function updateStatistics() {
    const standard = categories.filter(
        category => getCategoryType(category) === "standard"
    ).length;

    const custom = categories.filter(
        category => getCategoryType(category) !== "standard"
    ).length;

    document.getElementById("totalCategories").textContent = categories.length;
    document.getElementById("standardCategories").textContent = standard;
    document.getElementById("customCategories").textContent = custom;
}

function populateParentOptions(selectedId = "") {
    parentCategory.innerHTML =
        '<option value="">Main Category (No Parent)</option>';

    getMainCategories().forEach(category => {
        if (String(category.id) === String(categoryId.value)) return;

        const option = document.createElement("option");
        option.value = category.id;
        option.textContent = category.name;

        if (String(category.id) === String(selectedId)) {
            option.selected = true;
        }

        parentCategory.appendChild(option);
    });
}

function getSubcategories(parentId) {
    return categories.filter(
        category => String(getParentId(category)) === String(parentId)
    );
}

function renderCategories() {
    const search = categorySearch.value.trim().toLowerCase();
    const filter = categoryFilter.value;

    const mainCategories = getMainCategories().filter(category => {
        const type = getCategoryType(category);

        const matchesSearch =
            category.name.toLowerCase().includes(search) ||
            (category.description || "").toLowerCase().includes(search);

        const matchesFilter =
            filter === "all" ||
            (filter === "standard" && type === "standard") ||
            (filter === "custom" && type !== "standard");

        return matchesSearch && matchesFilter;
    });

    if (mainCategories.length === 0) {
        categoryList.innerHTML = `
            <div class="category-empty">
                <h3>No categories found</h3>
                <p>Try another search or create a new custom category.</p>
            </div>
        `;
        return;
    }

    categoryList.innerHTML = mainCategories.map(category => {
        const standard = getCategoryType(category) === "standard";
        const children = getSubcategories(category.id);

        const childHTML = children.length
            ? `<div class="category-children">
                ${children.map(child => {
                    const childIsStandard =
                        getCategoryType(child) === "standard";

                    return `
                        <div class="subcategory-item">
                            <span class="subcategory-tag">
                                ${escapeHTML(child.icon || "•")}
                                ${escapeHTML(child.name)}
                            </span>

                            ${
                                childIsStandard
                                    ? `<span class="subcategory-tag">
                                        Protected
                                       </span>`
                                    : `
                                        <div class="subcategory-actions">
                                            <button type="button"
                                                data-edit="${child.id}">
                                                Edit
                                            </button>

                                            <button type="button"
                                                class="delete-category"
                                                data-delete="${child.id}">
                                                Delete
                                            </button>
                                        </div>
                                    `
                            }
                        </div>
                    `;
                }).join("")}
               </div>`
            : "";

        return `
            <article class="category-card">
                <div class="category-card-top">
                    <span class="category-icon">
                        ${escapeHTML(category.icon || "📦")}
                    </span>

                    <span class="category-type">
                        ${standard ? "WIN STANDARD" : "CUSTOM"}
                    </span>
                </div>

                <h3>${escapeHTML(category.name)}</h3>

                <p class="category-description">
                    ${escapeHTML(category.description || "No description provided.")}
                </p>

                ${childHTML}

                <div class="category-meta">
                    <span>${Number(category.product_count || 0)} product(s)</span>
                    <span>${children.length} subcategory(s)</span>
                </div>

                <div class="category-card-actions">
                    ${
                        standard
                            ? `<span class="subcategory-tag">
                                Protected category
                               </span>`
                            : `
                                <button type="button" data-edit="${category.id}">
                                    Edit
                                </button>

                                <button type="button"
                                    class="delete-category"
                                    data-delete="${category.id}">
                                    Delete
                                </button>
                            `
                    }

                    <button type="button" data-add-child="${category.id}">
                        + Subcategory
                    </button>
                </div>
            </article>
        `;
    }).join("");
}

async function loadCategories() {
    categoryList.innerHTML = `
        <div class="category-empty">Loading categories...</div>
    `;

    try {
        const data = await apiRequest(API_URL);

        categories = Array.isArray(data.categories)
            ? data.categories
            : [];

        updateStatistics();
        populateParentOptions();
        renderCategories();

    } catch (error) {
        categoryList.innerHTML = `
            <div class="category-empty">
                <h3>Unable to load categories</h3>
                <p>${escapeHTML(error.message)}</p>
                <button type="button" onclick="loadCategories()">
                    Try Again
                </button>
            </div>
        `;
    }
}

function openCategoryModal(category = null, parentId = "") {
    categoryForm.reset();
    categoryMessage.textContent = "";
    categoryId.value = "";

    if (category) {
        document.getElementById("categoryModalTitle").textContent =
            "Edit Category";

        categoryId.value = category.id;
        categoryName.value = category.name || "";
        categoryDescription.value = category.description || "";
        categoryIcon.value = category.icon || "";

        populateParentOptions(getParentId(category) || "");
        parentCategory.disabled = true;

    } else {
        document.getElementById("categoryModalTitle").textContent =
            parentId ? "Add Subcategory" : "Add Category";

        parentCategory.disabled = false;
        populateParentOptions(parentId);
    }

    categoryModal.classList.add("show");
    categoryName.focus();
}

function closeCategoryModal() {
    categoryModal.classList.remove("show");
    categoryForm.reset();
    categoryId.value = "";
    parentCategory.disabled = false;
    categoryMessage.textContent = "";
}

async function saveCategory(event) {
    event.preventDefault();

    const id = categoryId.value;

    const payload = {
        name: categoryName.value.trim(),
        description: categoryDescription.value.trim(),
        icon: categoryIcon.value.trim(),
        parent_id: parentCategory.value || null
    };

    if (!payload.name) {
        categoryMessage.textContent = "Please enter a category name.";
        return;
    }

    const saveButton = document.getElementById("saveCategoryButton");
    saveButton.disabled = true;
    saveButton.textContent = "Saving...";

    try {
        const url = id
            ? `${API_URL}/${encodeURIComponent(id)}`
            : API_URL;

        await apiRequest(url, {
            method: id ? "PUT" : "POST",
            body: JSON.stringify(payload)
        });

        closeCategoryModal();
        await loadCategories();

    } catch (error) {
        categoryMessage.textContent = error.message;

    } finally {
        saveButton.disabled = false;
        saveButton.textContent = "Save Category";
    }
}

async function deleteCategory(id) {
    const category = categories.find(
        item => String(item.id) === String(id)
    );

    if (!category) return;

    const confirmed = confirm(
        `Delete "${category.name}"? This cannot be undone.`
    );

    if (!confirmed) return;

    try {
        await apiRequest(`${API_URL}/${encodeURIComponent(id)}`, {
            method: "DELETE"
        });

        await loadCategories();

    } catch (error) {
        alert(error.message);
    }
}

categoryList.addEventListener("click", event => {
    const editButton = event.target.closest("[data-edit]");
    const deleteButton = event.target.closest("[data-delete]");
    const childButton = event.target.closest("[data-add-child]");

    if (editButton) {
        const category = categories.find(
            item => String(item.id) === editButton.dataset.edit
        );

        if (category) openCategoryModal(category);
        return;
    }

    if (deleteButton) {
        deleteCategory(deleteButton.dataset.delete);
        return;
    }

    if (childButton) {
        openCategoryModal(null, childButton.dataset.addChild);
    }
});

addCategoryButton.addEventListener("click", () => {
    openCategoryModal();
});

cancelCategoryButton.addEventListener("click", closeCategoryModal);

categoryForm.addEventListener("submit", saveCategory);

categorySearch.addEventListener("input", renderCategories);
categoryFilter.addEventListener("change", renderCategories);

categoryModal.addEventListener("click", event => {
    if (event.target === categoryModal) {
        closeCategoryModal();
    }
});

loadCategories();
