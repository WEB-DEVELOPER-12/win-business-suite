
const express = require("express");
const db = require("../config/database");
const requireAuth = require("../middleware/requireAuth");

const router = express.Router();

router.use(requireAuth);

// WIN standard categories recommended for each business type.
const standardCategories = {
    "Retail": [
        ["Groceries", "Everyday food and household shopping", "🛒"],
        ["Electronics", "Electronic products and devices", "📱"],
        ["Clothing", "Clothes and fashion items", "👕"],
        ["Household Items", "Products used at home", "🏠"],
        ["Beverages", "Drinks and refreshments", "🥤"],
        ["Personal Care", "Personal hygiene and care products", "🧴"]
    ],
    "Supermarket": [
        ["Groceries", "Food and everyday essentials", "🛒"],
        ["Fresh Produce", "Fruits and vegetables", "🥬"],
        ["Meat and Poultry", "Fresh and packaged meat", "🥩"],
        ["Dairy Products", "Milk, cheese and dairy items", "🥛"],
        ["Beverages", "Water, juices and soft drinks", "🥤"],
        ["Household Items", "Cleaning and home products", "🏠"],
        ["Personal Care", "Hygiene and beauty products", "🧴"],
        ["Baby Products", "Baby food and essentials", "🍼"]
    ],
    "Minimart": [
        ["Groceries", "Everyday food items", "🛒"],
        ["Snacks", "Biscuits, crisps and snacks", "🍪"],
        ["Beverages", "Water, juices and soft drinks", "🥤"],
        ["Toiletries", "Personal hygiene essentials", "🧴"],
        ["Household Items", "Everyday home essentials", "🏠"]
    ],
    "Wholesale": [
        ["Foodstuffs", "Bulk food products", "🌾"],
        ["Beverages", "Bulk drinks and refreshments", "🥤"],
        ["Electronics", "Electronic products", "📱"],
        ["Household Goods", "Home and cleaning products", "🏠"],
        ["Personal Care", "Bulk hygiene products", "🧴"],
        ["Building Materials", "Construction supplies", "🧱"]
    ],
    "Wholesaler": [
        ["Foodstuffs", "Bulk food products", "🌾"],
        ["Beverages", "Bulk drinks and refreshments", "🥤"],
        ["Electronics", "Electronic products", "📱"],
        ["Household Goods", "Home and cleaning products", "🏠"],
        ["Personal Care", "Bulk hygiene products", "🧴"],
        ["Building Materials", "Construction supplies", "🧱"]
    ],
    "Cyber Cafe": [
        ["Printing", "Document and photo printing", "🖨️"],
        ["Photocopying", "Document photocopy services", "📄"],
        ["Internet Services", "Internet and computer access", "🌐"],
        ["Stationery", "Office and school supplies", "✏️"],
        ["Computer Services", "Computer-related services", "💻"],
        ["Online Applications", "Online forms and applications", "📋"]
    ],
    "Restaurant": [
        ["Food", "Meals and prepared dishes", "🍲"],
        ["Drinks", "Beverages and refreshments", "🥤"],
        ["Snacks", "Light meals and snacks", "🍟"],
        ["Desserts", "Sweet dishes and desserts", "🍰"]
    ],
    "Salon": [
        ["Hair Care", "Hair services and products", "💇"],
        ["Skin Care", "Skin treatments and products", "🧴"],
        ["Beauty Products", "Beauty and cosmetic products", "💄"],
        ["Nail Care", "Manicure and pedicure services", "💅"]
    ],
    "Barber Shop": [
        ["Haircuts", "Haircut services", "✂️"],
        ["Beard Services", "Beard trimming and grooming", "🧔"],
        ["Hair Products", "Hair care products", "🧴"],
        ["Grooming", "General grooming services", "💈"]
    ],
    "Kinyozi": [
        ["Haircuts", "Haircut services", "✂️"],
        ["Beard Services", "Beard trimming and grooming", "🧔"],
        ["Hair Products", "Hair care products", "🧴"],
        ["Grooming", "General grooming services", "💈"]
    ],
    "Pharmacy": [
        ["Prescription Medicines", "Medicines requiring prescriptions", "💊"],
        ["Over-the-Counter Medicines", "Non-prescription medicines", "🩹"],
        ["Medical Supplies", "Medical equipment and supplies", "🩺"],
        ["First Aid", "First aid products", "🧰"],
        ["Personal Care", "Personal hygiene products", "🧴"],
        ["Baby Care", "Baby health and care products", "🍼"],
        ["Health and Wellness", "General wellness products", "❤️"]
    ],
    "Butchery": [
        ["Beef", "Beef products", "🥩"],
        ["Goat Meat", "Goat meat products", "🍖"],
        ["Chicken", "Chicken products", "🍗"],
        ["Sausages", "Sausages and processed meat", "🌭"]
    ],
    "Hardware": [
        ["Cement", "Cement and related products", "🧱"],
        ["Plumbing", "Plumbing supplies", "🚰"],
        ["Electrical", "Electrical supplies", "💡"],
        ["Tools", "Hand and power tools", "🔧"],
        ["Paints", "Paints and painting supplies", "🎨"]
    ],
    "Bookshop": [
        ["Textbooks", "Educational textbooks", "📚"],
        ["Exercise Books", "School exercise books", "📓"],
        ["Stationery", "Writing and office supplies", "✏️"],
        ["Office Supplies", "Office equipment and supplies", "📁"]
    ],
    "Clothing Boutique": [
        ["Men's Wear", "Men's clothing", "👔"],
        ["Women's Wear", "Women's clothing", "👗"],
        ["Children's Wear", "Children's clothing", "👶"],
        ["Shoes", "Footwear", "👟"],
        ["Accessories", "Fashion accessories", "👜"]
    ],
    "Bakery": [
        ["Bread", "Bread and baked loaves", "🍞"],
        ["Cakes", "Cakes and celebration products", "🎂"],
        ["Pastries", "Pastries and baked snacks", "🥐"],
        ["Ingredients", "Baking ingredients", "🌾"]
    ],
    "Mobile Phone Shop": [
        ["Smartphones", "Mobile phones", "📱"],
        ["Accessories", "Phone accessories", "🎧"],
        ["Chargers", "Chargers and cables", "🔌"],
        ["Repairs", "Phone repair services", "🛠️"]
    ],
    "Hotel": [
        ["Accommodation", "Rooms and accommodation", "🛏️"],
        ["Food", "Restaurant and meal services", "🍲"],
        ["Beverages", "Drinks and refreshments", "🥤"],
        ["Events", "Event and conference services", "🎉"]
    ],
    "Transport": [
        ["Passenger Transport", "Passenger travel services", "🚌"],
        ["Delivery", "Delivery and courier services", "📦"],
        ["Vehicle Hire", "Vehicle rental services", "🚗"],
        ["Freight", "Goods transportation", "🚚"]
    ],
    "Services": [
        ["Professional Services", "Professional services", "💼"],
        ["Consulting", "Consulting services", "📊"],
        ["Repairs and Maintenance", "Repair and maintenance services", "🔧"]
    ],
    "Manufacturing": [
        ["Raw Materials", "Materials used in production", "🏭"],
        ["Finished Products", "Completed manufactured goods", "📦"],
        ["Packaging", "Packaging materials", "📦"],
        ["Spare Parts", "Production spare parts", "⚙️"]
    ],
    "Agriculture": [
        ["Seeds", "Seeds and planting materials", "🌱"],
        ["Fertilizers", "Fertilizers and soil products", "🌾"],
        ["Farm Tools", "Agricultural tools", "🚜"],
        ["Produce", "Harvested farm products", "🥬"],
        ["Animal Feed", "Livestock feed", "🐄"]
    ]
};

function sendDatabaseError(res, error) {
    console.error("Category database error:", error.message);
    return res.status(500).json({
        success: false,
        message: "A category database error occurred."
    });
}

// Check that a parent belongs to this business and is a main category.
function validateParent(businessId, parentId, callback) {
    if (parentId === null) {
        return callback(null, true);
    }

    db.get(
        `SELECT id FROM business_categories
         WHERE id = ? AND business_id = ? AND parent_id IS NULL`,
        [parentId, businessId],
        (error, row) => {
            if (error) return callback(error);
            callback(null, Boolean(row));
        }
    );
}

// Create recommended standard categories once for each business.
function seedStandardCategories(businessId, businessType, callback) {
    db.get(
        `SELECT COUNT(*) AS total
         FROM business_categories
         WHERE business_id = ? AND category_type = 'standard'`,
        [businessId],
        (error, result) => {
            if (error) return callback(error);

            if (result.total > 0) {
                return callback(null);
            }

            const categories =
                standardCategories[businessType] ||
                standardCategories["Retail"];

            let index = 0;

            function insertNext() {
                if (index >= categories.length) {
                    return callback(null);
                }

                const [name, description, icon] = categories[index++];

                db.run(
                    `INSERT INTO business_categories
                     (business_id, name, description, icon, category_type)
                     VALUES (?, ?, ?, ?, 'standard')`,
                    [businessId, name, description, icon],
                    error => {
                        if (error) return callback(error);
                        insertNext();
                    }
                );
            }

            insertNext();
        }
    );
}

// GET /api/categories
// List categories and their product counts.
router.get("/", (req, res) => {
    const businessId = req.session.user.business_id;

    db.get(
        "SELECT business_type FROM businesses WHERE id = ?",
        [businessId],
        (error, business) => {
            if (error) return sendDatabaseError(res, error);

            if (!business) {
                return res.status(404).json({
                    success: false,
                    message: "Business not found."
                });
            }

            seedStandardCategories(
                businessId,
                business.business_type,
                seedError => {
                    if (seedError) {
                        return sendDatabaseError(res, seedError);
                    }

                    db.all(
                        `SELECT
                            c.id,
                            c.name,
                            c.description,
                            c.icon,
                            c.parent_id,
                            c.category_type,
                            c.created_at,
                            (
                                SELECT COUNT(*)
                                FROM products p
                                WHERE p.category_id = c.id
                                  AND p.business_id = c.business_id
                            ) AS product_count
                         FROM business_categories c
                         WHERE c.business_id = ?
                         ORDER BY
                            CASE WHEN c.category_type = 'standard'
                                 THEN 0 ELSE 1 END,
                            c.parent_id IS NOT NULL,
                            c.name COLLATE NOCASE`,
                        [businessId],
                        (listError, categories) => {
                            if (listError) {
                                return sendDatabaseError(res, listError);
                            }

                            res.json({
                                success: true,
                                categories
                            });
                        }
                    );
                }
            );
        }
    );
});

// POST /api/categories
// Create a custom category or subcategory.
router.post("/", (req, res) => {
    const businessId = req.session.user.business_id;
    const name = String(req.body.name || "").trim();
    const description = String(req.body.description || "").trim();
    const icon = String(req.body.icon || "📁").trim();
    const parentId =
        req.body.parent_id === undefined ||
        req.body.parent_id === null ||
        req.body.parent_id === ""
            ? null
            : Number(req.body.parent_id);

    if (!name || name.length > 80) {
        return res.status(400).json({
            success: false,
            message: "Category name is required and must be 80 characters or fewer."
        });
    }

    if (
        parentId !== null &&
        (!Number.isInteger(parentId) || parentId <= 0)
    ) {
        return res.status(400).json({
            success: false,
            message: "Invalid parent category."
        });
    }

    validateParent(businessId, parentId, (error, valid) => {
        if (error) return sendDatabaseError(res, error);

        if (!valid) {
            return res.status(400).json({
                success: false,
                message: "Choose a valid main category belonging to your business."
            });
        }

        db.get(
            `SELECT id FROM business_categories
             WHERE business_id = ? AND name = ? AND parent_id IS ?`,
            [businessId, name, parentId],
            (checkError, existing) => {
                if (checkError) {
                    return sendDatabaseError(res, checkError);
                }

                if (existing) {
                    return res.status(409).json({
                        success: false,
                        message: "This category already exists."
                    });
                }

                db.run(
                    `INSERT INTO business_categories
                     (business_id, name, description, icon, parent_id, category_type)
                     VALUES (?, ?, ?, ?, ?, 'custom')`,
                    [businessId, name, description, icon, parentId],
                    function (insertError) {
                        if (insertError) {
                            return sendDatabaseError(res, insertError);
                        }

                        res.status(201).json({
                            success: true,
                            message: "Category created successfully.",
                            category: {
                                id: this.lastID,
                                name,
                                description,
                                icon,
                                parent_id: parentId,
                                category_type: "custom",
                                product_count: 0
                            }
                        });
                    }
                );
            }
        );
    });
});

// PUT /api/categories/:id
// Only custom categories can be edited.
router.put("/:id", (req, res) => {
    const businessId = req.session.user.business_id;
    const categoryId = Number(req.params.id);
    const name = String(req.body.name || "").trim();
    const description = String(req.body.description || "").trim();
    const icon = String(req.body.icon || "📁").trim();

    if (!Number.isInteger(categoryId) || categoryId <= 0) {
        return res.status(400).json({
            success: false,
            message: "Invalid category."
        });
    }

    if (!name || name.length > 80) {
        return res.status(400).json({
            success: false,
            message: "Category name is required and must be 80 characters or fewer."
        });
    }

    db.get(
        `SELECT id, parent_id, category_type
         FROM business_categories
         WHERE id = ? AND business_id = ?`,
        [categoryId, businessId],
        (error, category) => {
            if (error) return sendDatabaseError(res, error);

            if (!category) {
                return res.status(404).json({
                    success: false,
                    message: "Category not found."
                });
            }

            if (category.category_type === "standard") {
                return res.status(403).json({
                    success: false,
                    message: "WIN standard categories cannot be edited."
                });
            }

            db.get(
                `SELECT id FROM business_categories
                 WHERE business_id = ?
                   AND name = ?
                   AND parent_id IS ?
                   AND id != ?`,
                [businessId, name, category.parent_id, categoryId],
                (checkError, existing) => {
                    if (checkError) {
                        return sendDatabaseError(res, checkError);
                    }

                    if (existing) {
                        return res.status(409).json({
                            success: false,
                            message: "Another category with this name already exists."
                        });
                    }

                    db.run(
                        `UPDATE business_categories
                         SET name = ?, description = ?, icon = ?
                         WHERE id = ? AND business_id = ?
                           AND category_type = 'custom'`,
                        [name, description, icon, categoryId, businessId],
                        updateError => {
                            if (updateError) {
                                return sendDatabaseError(res, updateError);
                            }

                            res.json({
                                success: true,
                                message: "Category updated successfully."
                            });
                        }
                    );
                }
            );
        }
    );
});

// DELETE /api/categories/:id
// Standard categories, categories in use and categories with children are protected.
router.delete("/:id", (req, res) => {
    const businessId = req.session.user.business_id;
    const categoryId = Number(req.params.id);

    if (!Number.isInteger(categoryId) || categoryId <= 0) {
        return res.status(400).json({
            success: false,
            message: "Invalid category."
        });
    }

    db.get(
        `SELECT id, category_type
         FROM business_categories
         WHERE id = ? AND business_id = ?`,
        [categoryId, businessId],
        (error, category) => {
            if (error) return sendDatabaseError(res, error);

            if (!category) {
                return res.status(404).json({
                    success: false,
                    message: "Category not found."
                });
            }

            if (category.category_type === "standard") {
                return res.status(403).json({
                    success: false,
                    message: "WIN standard categories cannot be deleted."
                });
            }

            db.get(
                `SELECT COUNT(*) AS total
                 FROM products
                 WHERE category_id = ? AND business_id = ?`,
                [categoryId, businessId],
                (productError, productResult) => {
                    if (productError) {
                        return sendDatabaseError(res, productError);
                    }

                    if (productResult.total > 0) {
                        return res.status(409).json({
                            success: false,
                            message: "This category contains products. Reassign those products before deleting it."
                        });
                    }

                    db.get(
                        `SELECT COUNT(*) AS total
                         FROM business_categories
                         WHERE parent_id = ? AND business_id = ?`,
                        [categoryId, businessId],
                        (childError, childResult) => {
                            if (childError) {
                                return sendDatabaseError(res, childError);
                            }

                            if (childResult.total > 0) {
                                return res.status(409).json({
                                    success: false,
                                    message: "This category has subcategories. Delete or move them first."
                                });
                            }

                            db.run(
                                `DELETE FROM business_categories
                                 WHERE id = ? AND business_id = ?
                                   AND category_type = 'custom'`,
                                [categoryId, businessId],
                                deleteError => {
                                    if (deleteError) {
                                        return sendDatabaseError(res, deleteError);
                                    }

                                    res.json({
                                        success: true,
                                        message: "Category deleted successfully."
                                    });
                                }
                            );
                        }
                    );
                }
            );
        }
    );
});

module.exports = router;
