
const express = require("express");
const db = require("../config/database");
const requireAuth = require("../middleware/requireAuth");

const router = express.Router();

// Protect every inventory route
router.use(requireAuth);

// GET ALL PRODUCTS WITH CATEGORY NAMES
router.get("/", (req, res) => {
    const businessId = req.session.user.business_id;

    db.all(
        `SELECT
            p.id,
            p.product_name,
            p.description,
            p.selling_price,
            p.buying_price,
            p.stock_quantity,
            p.low_stock_level,
            p.category_id,
            c.name AS category_name,
            p.created_at
         FROM products p
         LEFT JOIN business_categories c
            ON c.id = p.category_id
            AND c.business_id = p.business_id
         WHERE p.business_id = ?
         ORDER BY
            COALESCE(c.name, 'Uncategorised') ASC,
            p.product_name ASC`,
        [businessId],
        (error, products) => {
            if (error) {
                console.error("Inventory loading error:", error);

                return res.status(500).json({
                    success: false,
                    message: "Could not load products."
                });
            }

            res.json({
                success: true,
                products
            });
        }
    );
});

// ADD PRODUCT
router.post("/", (req, res) => {
    const businessId = req.session.user.business_id;

    const {
        product_name,
        description,
        selling_price,
        buying_price,
        stock_quantity,
        low_stock_level,
        category_id
    } = req.body;

    if (
        typeof product_name !== "string" ||
        !product_name.trim()
    ) {
        return res.status(400).json({
            success: false,
            message: "Product name is required."
        });
    }

    const sellingPrice = Number(selling_price);
    const buyingPrice = Number(buying_price ?? 0);
    const stockQuantity = Number(stock_quantity ?? 0);
    const lowStockLevel = Number(low_stock_level ?? 5);

    if (
        !Number.isFinite(sellingPrice) ||
        !Number.isFinite(buyingPrice) ||
        !Number.isFinite(stockQuantity) ||
        !Number.isFinite(lowStockLevel) ||
        sellingPrice < 0 ||
        buyingPrice < 0 ||
        stockQuantity < 0 ||
        lowStockLevel < 0
    ) {
        return res.status(400).json({
            success: false,
            message: "Prices and stock values must be valid non-negative numbers."
        });
    }

    const cleanDescription =
        typeof description === "string" ? description.trim() : "";

    const cleanCategoryId =
        category_id === undefined || category_id === null || category_id === ""
            ? null
            : Number(category_id);

    if (
        cleanCategoryId !== null &&
        (!Number.isInteger(cleanCategoryId) || cleanCategoryId <= 0)
    ) {
        return res.status(400).json({
            success: false,
            message: "Invalid product category."
        });
    }

    const insertProduct = () => {
        db.run(
            `INSERT INTO products (
                business_id,
                category_id,
                product_name,
                description,
                selling_price,
                buying_price,
                stock_quantity,
                low_stock_level
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                businessId,
                cleanCategoryId,
                product_name.trim(),
                cleanDescription,
                sellingPrice,
                buyingPrice,
                stockQuantity,
                lowStockLevel
            ],
            function (error) {
                if (error) {
                    return res.status(500).json({
                        success: false,
                        message: "Could not add product."
                    });
                }

                res.status(201).json({
                    success: true,
                    message: "Product added successfully.",
                    product_id: this.lastID
                });
            }
        );
    };

    if (cleanCategoryId === null) {
        return insertProduct();
    }

    db.get(
        `SELECT id FROM business_categories
         WHERE id = ? AND business_id = ?`,
        [cleanCategoryId, businessId],
        (error, category) => {
            if (error) {
                return res.status(500).json({
                    success: false,
                    message: "Could not verify product category."
                });
            }

            if (!category) {
                return res.status(400).json({
                    success: false,
                    message: "Category not found in your business."
                });
            }

            insertProduct();
        }
    );
});

// UPDATE PRODUCT
router.put("/:id", (req, res) => {
    const businessId = req.session.user.business_id;
    const productId = Number(req.params.id);

    if (!Number.isInteger(productId) || productId <= 0) {
        return res.status(400).json({
            success: false,
            message: "Invalid product ID."
        });
    }

    const {
        product_name,
        description,
        selling_price,
        buying_price,
        stock_quantity,
        low_stock_level,
        category_id
    } = req.body;

    if (
        typeof product_name !== "string" ||
        !product_name.trim()
    ) {
        return res.status(400).json({
            success: false,
            message: "Product name is required."
        });
    }

    const sellingPrice = Number(selling_price);
    const buyingPrice = Number(buying_price);
    const stockQuantity = Number(stock_quantity);
    const lowStockLevel = Number(low_stock_level);

    if (
        !Number.isFinite(sellingPrice) ||
        !Number.isFinite(buyingPrice) ||
        !Number.isFinite(stockQuantity) ||
        !Number.isFinite(lowStockLevel) ||
        sellingPrice < 0 ||
        buyingPrice < 0 ||
        stockQuantity < 0 ||
        lowStockLevel < 0
    ) {
        return res.status(400).json({
            success: false,
            message: "Enter valid non-negative prices and stock values."
        });
    }

    const cleanCategoryId =
        category_id === undefined || category_id === null || category_id === ""
            ? null
            : Number(category_id);

    if (
        cleanCategoryId !== null &&
        (!Number.isInteger(cleanCategoryId) || cleanCategoryId <= 0)
    ) {
        return res.status(400).json({
            success: false,
            message: "Invalid product category."
        });
    }

    const cleanDescription =
        typeof description === "string" ? description.trim() : "";

    const updateProduct = () => {
        db.run(
            `UPDATE products SET
                category_id = ?,
                product_name = ?,
                description = ?,
                selling_price = ?,
                buying_price = ?,
                stock_quantity = ?,
                low_stock_level = ?
             WHERE id = ? AND business_id = ?`,
            [
                cleanCategoryId,
                product_name.trim(),
                cleanDescription,
                sellingPrice,
                buyingPrice,
                stockQuantity,
                lowStockLevel,
                productId,
                businessId
            ],
            function (error) {
                if (error) {
                    return res.status(500).json({
                        success: false,
                        message: "Could not update product."
                    });
                }

                if (this.changes === 0) {
                    return res.status(404).json({
                        success: false,
                        message: "Product not found."
                    });
                }

                res.json({
                    success: true,
                    message: "Product updated successfully."
                });
            }
        );
    };

    if (cleanCategoryId === null) {
        return updateProduct();
    }

    db.get(
        `SELECT id FROM business_categories
         WHERE id = ? AND business_id = ?`,
        [cleanCategoryId, businessId],
        (error, category) => {
            if (error) {
                return res.status(500).json({
                    success: false,
                    message: "Could not verify product category."
                });
            }

            if (!category) {
                return res.status(400).json({
                    success: false,
                    message: "Category not found in your business."
                });
            }

            updateProduct();
        }
    );
});

// DELETE PRODUCT
router.delete("/:id", (req, res) => {
    const businessId = req.session.user.business_id;
    const productId = Number(req.params.id);

    if (!Number.isInteger(productId) || productId <= 0) {
        return res.status(400).json({
            success: false,
            message: "Invalid product ID."
        });
    }

    db.run(
        `DELETE FROM products
         WHERE id = ? AND business_id = ?`,
        [productId, businessId],
        function (error) {
            if (error) {
                return res.status(500).json({
                    success: false,
                    message: "Could not delete product."
                });
            }

            if (this.changes === 0) {
                return res.status(404).json({
                    success: false,
                    message: "Product not found."
                });
            }

            res.json({
                success: true,
                message: "Product deleted successfully."
            });
        }
    );
});

module.exports = router;
