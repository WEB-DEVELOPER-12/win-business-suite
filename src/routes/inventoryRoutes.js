
"use strict";

const express = require("express");
const db = require("../config/postgresRouteDatabase");
const requireAuth = require("../middleware/requireAuth");

const router = express.Router();

router.use(requireAuth);
router.use(db.middleware);

// COMMON HELPERS

function getBusinessId(req) {
    return req.session.user.business_id;
}

function getUserId(req) {
    return req.session.user.id;
}

function validId(value) {
    const id = Number(value);
    return Number.isInteger(id) && id > 0 ? id : null;
}

function validNumber(value) {
    return value !== "" &&
        value !== null &&
        value !== undefined &&
        Number.isFinite(Number(value));
}

function rollback(res, message, status = 500) {
    db.run("ROLLBACK", error => {
        if (error) {
            console.error("Inventory rollback error:", error);
        }

        if (!res.headersSent && !res.destroyed) {
            res.status(status).json({
                success: false,
                message
            });
        }
    });
}

// GET ALL PRODUCTS

router.get("/", (req, res) => {
    const businessId = getBusinessId(req);

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

// INVENTORY SUMMARY AND VALUATION

router.get("/summary", (req, res) => {
    const businessId = getBusinessId(req);

    db.get(
        `SELECT
            COUNT(*) AS total_products,
            COALESCE(SUM(stock_quantity), 0) AS total_stock_units,
            COALESCE(
                SUM(stock_quantity * buying_price), 0
            ) AS stock_cost_value,
            COALESCE(
                SUM(stock_quantity * selling_price), 0
            ) AS potential_sales_value,
            COALESCE(
                SUM(
                    CASE
                        WHEN stock_quantity <= low_stock_level
                        THEN 1
                        ELSE 0
                    END
                ), 0
            ) AS low_stock_products
        FROM products
        WHERE business_id = ?`,
        [businessId],
        (error, summary) => {
            if (error) {
                console.error("Inventory summary error:", error);

                return res.status(500).json({
                    success: false,
                    message: "Could not load inventory summary."
                });
            }

            res.json({
                success: true,
                summary
            });
        }
    );
});

// ADD PRODUCT

router.post("/", (req, res) => {
    const businessId = getBusinessId(req);
    const userId = getUserId(req);

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
        typeof description === "string"
            ? description.trim()
            : "";

    const cleanCategoryId =
        category_id === undefined ||
        category_id === null ||
        category_id === ""
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

    function createProduct() {
        db.run("BEGIN", error => {
            if (error) {
                console.error("Product transaction error:", error);

                return res.status(500).json({
                    success: false,
                    message: "Could not start product creation."
                });
            }

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
                function (insertError) {
                    if (insertError) {
                        console.error("Product creation error:", insertError);

                        return rollback(
                            res,
                            "Could not add product."
                        );
                    }

                    const productId = this.lastID;

                    function completeCreation() {
                        db.run("COMMIT", commitError => {
                            if (commitError) {
                                console.error(
                                    "Product commit error:",
                                    commitError
                                );

                                return rollback(
                                    res,
                                    "Could not complete product creation."
                                );
                            }

                            res.status(201).json({
                                success: true,
                                message: "Product added successfully.",
                                product_id: productId
                            });
                        });
                    }

                    if (stockQuantity === 0) {
                        return completeCreation();
                    }

                    db.run(
                        `INSERT INTO stock_movements (
                            business_id,
                            product_id,
                            movement_type,
                            quantity_before,
                            quantity_changed,
                            quantity_after,
                            reason,
                            reference_type,
                            reference_id,
                            created_by
                        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                        [
                            businessId,
                            productId,
                            "opening_stock",
                            0,
                            stockQuantity,
                            stockQuantity,
                            "Opening stock when product was created",
                            "product_creation",
                            productId,
                            userId
                        ],
                        movementError => {
                            if (movementError) {
                                console.error(
                                    "Opening stock recording error:",
                                    movementError
                                );

                                return rollback(
                                    res,
                                    "Could not record opening stock."
                                );
                            }

                            completeCreation();
                        }
                    );
                }
            );
        });
    }

    if (cleanCategoryId === null) {
        return createProduct();
    }

    db.get(
        `SELECT id
         FROM business_categories
         WHERE id = ? AND business_id = ?`,
        [cleanCategoryId, businessId],
        (error, category) => {
            if (error) {
                console.error("Category verification error:", error);

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

            createProduct();
        }
    );
});

// UPDATE PRODUCT DETAILS AND CURRENT QUANTITY

router.put("/:id", (req, res) => {
    const businessId = getBusinessId(req);
    const userId = getUserId(req);
    const productId = validId(req.params.id);

    if (!productId) {
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

    if (
        !validNumber(selling_price) ||
        !validNumber(buying_price) ||
        !validNumber(stock_quantity) ||
        !validNumber(low_stock_level)
    ) {
        return res.status(400).json({
            success: false,
            message: "Enter valid prices, current quantity and low-stock values."
        });
    }

    const sellingPrice = Number(selling_price);
    const buyingPrice = Number(buying_price);
    const stockQuantity = Number(stock_quantity);
    const lowStockLevel = Number(low_stock_level);

    if (
        sellingPrice < 0 ||
        buyingPrice < 0 ||
        stockQuantity < 0 ||
        lowStockLevel < 0
    ) {
        return res.status(400).json({
            success: false,
            message: "Prices and stock values cannot be negative."
        });
    }

    const cleanCategoryId =
        category_id === undefined ||
        category_id === null ||
        category_id === ""
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
        typeof description === "string"
            ? description.trim()
            : "";

    function updateProduct() {
        db.run("BEGIN", beginError => {
            if (beginError) {
                console.error("Product update transaction error:", beginError);

                return res.status(500).json({
                    success: false,
                    message: "Could not start product update."
                });
            }

            db.get(
                `SELECT id, stock_quantity
                 FROM products
                 WHERE id = ? AND business_id = ?
                 FOR UPDATE`,
                [productId, businessId],
                (lookupError, product) => {
                    if (lookupError) {
                        console.error("Product update lookup error:", lookupError);

                        return rollback(
                            res,
                            "Could not load the product."
                        );
                    }

                    if (!product) {
                        return rollback(
                            res,
                            "Product not found.",
                            404
                        );
                    }

                    const quantityBefore = Number(product.stock_quantity);
                    const quantityChanged = stockQuantity - quantityBefore;

                    db.run(
                        `UPDATE products SET
                            category_id = ?,
                            product_name = ?,
                            description = ?,
                            selling_price = ?,
                            buying_price = ?,
                            stock_quantity = ?,
                            low_stock_level = ?
                        WHERE id = ?
                          AND business_id = ?
                          AND stock_quantity = ?`,
                        [
                            cleanCategoryId,
                            product_name.trim(),
                            cleanDescription,
                            sellingPrice,
                            buyingPrice,
                            stockQuantity,
                            lowStockLevel,
                            productId,
                            businessId,
                            quantityBefore
                        ],
                        function (updateError) {
                            if (updateError) {
                                console.error("Product update error:", updateError);

                                return rollback(
                                    res,
                                    "Could not update product."
                                );
                            }

                            if (this.changes !== 1) {
                                return rollback(
                                    res,
                                    "Product changed during this operation. Please try again.",
                                    409
                                );
                            }

                            function completeUpdate() {
                                db.run("COMMIT", commitError => {
                                    if (commitError) {
                                        console.error(
                                            "Product update commit error:",
                                            commitError
                                        );

                                        return rollback(
                                            res,
                                            "Could not complete product update."
                                        );
                                    }

                                    res.json({
                                        success: true,
                                        message: "Product and current quantity updated successfully.",
                                        stock: {
                                            quantity_before: quantityBefore,
                                            quantity_changed: quantityChanged,
                                            quantity_after: stockQuantity
                                        }
                                    });
                                });
                            }

                            if (quantityChanged === 0) {
                                return completeUpdate();
                            }

                            db.run(
                                `INSERT INTO stock_movements (
                                    business_id,
                                    product_id,
                                    movement_type,
                                    quantity_before,
                                    quantity_changed,
                                    quantity_after,
                                    reason,
                                    reference_type,
                                    reference_id,
                                    created_by
                                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                                [
                                    businessId,
                                    productId,
                                    "adjustment",
                                    quantityBefore,
                                    quantityChanged,
                                    stockQuantity,
                                    "Current quantity updated through Edit Product",
                                    "product_edit",
                                    productId,
                                    userId
                                ],
                                movementError => {
                                    if (movementError) {
                                        console.error(
                                            "Product quantity history error:",
                                            movementError
                                        );

                                        return rollback(
                                            res,
                                            "Could not record the quantity change. Product update was cancelled."
                                        );
                                    }

                                    completeUpdate();
                                }
                            );
                        }
                    );
                }
            );
        });
    }

    if (cleanCategoryId === null) {
        return updateProduct();
    }

    db.get(
        `SELECT id
         FROM business_categories
         WHERE id = ? AND business_id = ?`,
        [cleanCategoryId, businessId],
        (error, category) => {
            if (error) {
                console.error("Category verification error:", error);

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

// STOCK ADJUSTMENT ENDPOINT
// Retained for compatibility. Not displayed in the V1 interface.

router.post("/:id/adjustments", (req, res) => {
    const businessId = getBusinessId(req);
    const userId = getUserId(req);
    const productId = validId(req.params.id);

    if (!productId) {
        return res.status(400).json({
            success: false,
            message: "Invalid product ID."
        });
    }

    const quantityChange = Number(req.body.quantity_change);
    const reason =
        typeof req.body.reason === "string"
            ? req.body.reason.trim()
            : "";

    if (
        !Number.isFinite(quantityChange) ||
        quantityChange === 0
    ) {
        return res.status(400).json({
            success: false,
            message: "Enter a valid stock adjustment quantity."
        });
    }

    if (!reason || reason.length > 250) {
        return res.status(400).json({
            success: false,
            message: "A reason of up to 250 characters is required."
        });
    }

    db.run("BEGIN", error => {
        if (error) {
            console.error("Stock adjustment transaction error:", error);

            return res.status(500).json({
                success: false,
                message: "Could not start stock adjustment."
            });
        }

        db.get(
            `SELECT id, stock_quantity
             FROM products
             WHERE id = ? AND business_id = ?
             FOR UPDATE`,
            [productId, businessId],
            (productError, product) => {
                if (productError) {
                    console.error("Stock product lookup error:", productError);

                    return rollback(
                        res,
                        "Could not load product."
                    );
                }

                if (!product) {
                    return rollback(
                        res,
                        "Product not found.",
                        404
                    );
                }

                const quantityBefore = Number(product.stock_quantity);
                const quantityAfter = quantityBefore + quantityChange;

                if (
                    !Number.isFinite(quantityAfter) ||
                    quantityAfter < 0
                ) {
                    return rollback(
                        res,
                        "This adjustment would make stock negative.",
                        409
                    );
                }

                db.run(
                    `UPDATE products
                     SET stock_quantity = ?
                     WHERE id = ?
                       AND business_id = ?
                       AND stock_quantity = ?`,
                    [
                        quantityAfter,
                        productId,
                        businessId,
                        quantityBefore
                    ],
                    function (updateError) {
                        if (updateError) {
                            console.error(
                                "Stock adjustment update error:",
                                updateError
                            );

                            return rollback(
                                res,
                                "Could not update stock."
                            );
                        }

                        if (this.changes !== 1) {
                            return rollback(
                                res,
                                "Stock changed during this operation. Please try again.",
                                409
                            );
                        }

                        db.run(
                            `INSERT INTO stock_movements (
                                business_id,
                                product_id,
                                movement_type,
                                quantity_before,
                                quantity_changed,
                                quantity_after,
                                reason,
                                reference_type,
                                reference_id,
                                created_by
                            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                            [
                                businessId,
                                productId,
                                "adjustment",
                                quantityBefore,
                                quantityChange,
                                quantityAfter,
                                reason,
                                "manual_adjustment",
                                productId,
                                userId
                            ],
                            movementError => {
                                if (movementError) {
                                    console.error(
                                        "Stock movement recording error:",
                                        movementError
                                    );

                                    return rollback(
                                        res,
                                        "Could not record stock adjustment."
                                    );
                                }

                                db.run("COMMIT", commitError => {
                                    if (commitError) {
                                        console.error(
                                            "Stock adjustment commit error:",
                                            commitError
                                        );

                                        return rollback(
                                            res,
                                            "Could not complete stock adjustment."
                                        );
                                    }

                                    res.json({
                                        success: true,
                                        message: "Stock adjusted successfully.",
                                        stock: {
                                            quantity_before: quantityBefore,
                                            quantity_changed: quantityChange,
                                            quantity_after: quantityAfter
                                        }
                                    });
                                });
                            }
                        );
                    }
                );
            }
        );
    });
});

// PRODUCT STOCK MOVEMENT HISTORY

router.get("/:id/movements", (req, res) => {
    const businessId = getBusinessId(req);
    const productId = validId(req.params.id);

    if (!productId) {
        return res.status(400).json({
            success: false,
            message: "Invalid product ID."
        });
    }

    db.get(
        `SELECT id
         FROM products
         WHERE id = ? AND business_id = ?`,
        [productId, businessId],
        (productError, product) => {
            if (productError) {
                return res.status(500).json({
                    success: false,
                    message: "Could not verify product."
                });
            }

            if (!product) {
                return res.status(404).json({
                    success: false,
                    message: "Product not found."
                });
            }

            db.all(
                `SELECT
                    sm.id,
                    sm.movement_type,
                    sm.quantity_before,
                    sm.quantity_changed,
                    sm.quantity_after,
                    sm.reason,
                    sm.reference_type,
                    sm.reference_id,
                    sm.created_at,
                    u.full_name AS created_by_name
                FROM stock_movements sm
                LEFT JOIN users u ON u.id = sm.created_by
                WHERE sm.business_id = ?
                  AND sm.product_id = ?
                ORDER BY sm.created_at DESC, sm.id DESC
                LIMIT 200`,
                [businessId, productId],
                (error, movements) => {
                    if (error) {
                        console.error("Movement history error:", error);

                        return res.status(500).json({
                            success: false,
                            message: "Could not load stock movement history."
                        });
                    }

                    res.json({
                        success: true,
                        movements
                    });
                }
            );
        }
    );
});

// DELETE PRODUCT SAFELY

router.delete("/:id", (req, res) => {
    const businessId = getBusinessId(req);
    const productId = validId(req.params.id);

    if (!productId) {
        return res.status(400).json({
            success: false,
            message: "Invalid product ID."
        });
    }

    db.run("BEGIN", beginError => {
        if (beginError) {
            console.error("Product deletion transaction error:", beginError);

            return res.status(500).json({
                success: false,
                message: "Could not start product deletion."
            });
        }

        db.get(
            `SELECT id, stock_quantity
             FROM products
             WHERE id = ? AND business_id = ?
             FOR UPDATE`,
            [productId, businessId],
            (productError, product) => {
                if (productError) {
                    console.error("Product deletion lookup error:", productError);

                    return rollback(
                        res,
                        "Could not verify product."
                    );
                }

                if (!product) {
                    return rollback(
                        res,
                        "Product not found.",
                        404
                    );
                }

                if (Number(product.stock_quantity) > 0) {
                    return rollback(
                        res,
                        "This product still has stock. Update its current quantity to zero before deleting it.",
                        409
                    );
                }

                db.get(
                    `SELECT
                        EXISTS(
                            SELECT 1 FROM stock_movements
                            WHERE product_id = ?
                        ) AS has_movements,
                        EXISTS(
                            SELECT 1 FROM debtor_transaction_items
                            WHERE product_id = ?
                        ) AS has_debtor_history,
                        EXISTS(
                            SELECT 1 FROM purchase_items
                            WHERE product_id = ?
                        ) AS has_purchase_history`,
                    [productId, productId, productId],
                    (historyError, history) => {
                        if (historyError) {
                            console.error(
                                "Product history check error:",
                                historyError
                            );

                            return rollback(
                                res,
                                "Could not check product history."
                            );
                        }

                        if (
                            history.has_movements ||
                            history.has_debtor_history ||
                            history.has_purchase_history
                        ) {
                            return rollback(
                                res,
                                "This product has historical records and cannot be deleted. Product archiving will be provided separately.",
                                409
                            );
                        }

                        db.run(
                            `DELETE FROM products
                             WHERE id = ? AND business_id = ?`,
                            [productId, businessId],
                            function (deleteError) {
                                if (deleteError) {
                                    console.error(
                                        "Product deletion error:",
                                        deleteError
                                    );

                                    return rollback(
                                        res,
                                        "Could not delete product."
                                    );
                                }

                                if (this.changes === 0) {
                                    return rollback(
                                        res,
                                        "Product not found.",
                                        404
                                    );
                                }

                                db.run("COMMIT", commitError => {
                                    if (commitError) {
                                        console.error(
                                            "Product deletion commit error:",
                                            commitError
                                        );

                                        return rollback(
                                            res,
                                            "Could not complete product deletion."
                                        );
                                    }

                                    res.json({
                                        success: true,
                                        message: "Product deleted successfully."
                                    });
                                });
                            }
                        );
                    }
                );
            }
        );
    });
});

module.exports = router;
