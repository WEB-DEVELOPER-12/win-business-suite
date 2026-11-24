const express = require("express");
const crypto = require("crypto");
const db = require("../config/database");
const requireAuth = require("../middleware/requireAuth");

const router = express.Router();

router.use(requireAuth);

// VALIDATE A REAL YYYY-MM-DD DATE
function isValidDate(value) {
    if (typeof value !== "string") return false;

    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
        return false;
    }

    const [year, month, day] = value.split("-").map(Number);
    const date = new Date(Date.UTC(year, month - 1, day));

    return (
        date.getUTCFullYear() === year &&
        date.getUTCMonth() === month - 1 &&
        date.getUTCDate() === day
    );
}

// LOAD PRODUCTS AND SUPPLIERS FOR THE PURCHASE FORM
router.get("/options", (req, res) => {
    const businessId = req.session.user.business_id;

    db.all(
        `SELECT id, product_name, buying_price, stock_quantity
         FROM products
         WHERE business_id = ?
         ORDER BY product_name ASC`,
        [businessId],
        (productError, products) => {
            if (productError) {
                return res.status(500).json({
                    success: false,
                    message: "Could not load products."
                });
            }

            db.all(
                `SELECT id, supplier_name, phone
                 FROM suppliers
                 WHERE business_id = ?
                 ORDER BY supplier_name ASC`,
                [businessId],
                (supplierError, suppliers) => {
                    if (supplierError) {
                        return res.status(500).json({
                            success: false,
                            message: "Could not load suppliers."
                        });
                    }

                    res.json({
                        success: true,
                        products,
                        suppliers
                    });
                }
            );
        }
    );
});

// GET PURCHASE HISTORY
router.get("/", (req, res) => {
    const businessId = req.session.user.business_id;

    db.all(
        `SELECT
            p.id,
            p.purchase_number,
            p.total_amount,
            p.purchase_date,
            p.notes,
            s.supplier_name
         FROM purchases p
         LEFT JOIN suppliers s ON s.id = p.supplier_id
         WHERE p.business_id = ?
         ORDER BY p.id DESC`,
        [businessId],
        (error, purchases) => {
            if (error) {
                return res.status(500).json({
                    success: false,
                    message: "Could not load purchase history."
                });
            }

            res.json({
                success: true,
                purchases
            });
        }
    );
});

// GET PURCHASE DETAILS
router.get("/:id", (req, res) => {
    const businessId = req.session.user.business_id;
    const purchaseId = Number(req.params.id);

    if (!Number.isInteger(purchaseId) || purchaseId <= 0) {
        return res.status(400).json({
            success: false,
            message: "Invalid purchase ID."
        });
    }

    db.get(
        `SELECT
            p.*,
            s.supplier_name,
            s.phone AS supplier_phone
         FROM purchases p
         LEFT JOIN suppliers s ON s.id = p.supplier_id
         WHERE p.id = ? AND p.business_id = ?`,
        [purchaseId, businessId],
        (error, purchase) => {
            if (error) {
                return res.status(500).json({
                    success: false,
                    message: "Could not load purchase."
                });
            }

            if (!purchase) {
                return res.status(404).json({
                    success: false,
                    message: "Purchase not found."
                });
            }

            db.all(
                `SELECT
                    id,
                    product_id,
                    product_name,
                    quantity,
                    unit_cost,
                    line_total
                 FROM purchase_items
                 WHERE purchase_id = ?
                 ORDER BY id ASC`,
                [purchaseId],
                (itemsError, items) => {
                    if (itemsError) {
                        return res.status(500).json({
                            success: false,
                            message: "Could not load purchase items."
                        });
                    }

                    res.json({
                        success: true,
                        purchase,
                        items
                    });
                }
            );
        }
    );
});

// CREATE A PURCHASE AND INCREASE STOCK
router.post("/", (req, res) => {
    const businessId = req.session.user.business_id;
    const userId = req.session.user.id;

    const supplierId =
        req.body.supplier_id === undefined ||
        req.body.supplier_id === null ||
        req.body.supplier_id === ""
            ? null
            : Number(req.body.supplier_id);

    const notes =
        typeof req.body.notes === "string"
            ? req.body.notes.trim()
            : "";

    const purchaseDate =
        req.body.purchase_date === undefined ||
        req.body.purchase_date === null ||
        req.body.purchase_date === ""
            ? null
            : req.body.purchase_date;

    if (
        purchaseDate !== null &&
        !isValidDate(purchaseDate)
    ) {
        return res.status(400).json({
            success: false,
            message: "Enter a valid purchase date."
        });
    }

    const items = req.body.items;

    if (
        supplierId !== null &&
        (!Number.isInteger(supplierId) || supplierId <= 0)
    ) {
        return res.status(400).json({
            success: false,
            message: "Invalid supplier."
        });
    }

    if (
        !Array.isArray(items) ||
        items.length === 0 ||
        items.length > 100
    ) {
        return res.status(400).json({
            success: false,
            message: "Add between 1 and 100 purchase items."
        });
    }

    const cleanItems = [];
    const seenProducts = new Set();

    for (const item of items) {
        const productId = Number(item.product_id);
        const quantity = Number(item.quantity);
        const unitCost = Number(item.unit_cost);

        if (
            !Number.isInteger(productId) ||
            productId <= 0 ||
            !Number.isFinite(quantity) ||
            quantity <= 0 ||
            !Number.isFinite(unitCost) ||
            unitCost < 0
        ) {
            return res.status(400).json({
                success: false,
                message: "Each item needs a valid product, quantity and buying price."
            });
        }

        if (seenProducts.has(productId)) {
            return res.status(400).json({
                success: false,
                message: "A product can only appear once in a purchase."
            });
        }

        seenProducts.add(productId);

        const lineTotal = quantity * unitCost;

        if (!Number.isFinite(lineTotal) || lineTotal > 1000000000000) {
            return res.status(400).json({
                success: false,
                message: "Purchase item total is too large."
            });
        }

        cleanItems.push({
            productId,
            quantity,
            unitCost,
            lineTotal
        });
    }

    const totalAmount = cleanItems.reduce(
        (total, item) => total + item.lineTotal,
        0
    );

    if (
        !Number.isFinite(totalAmount) ||
        totalAmount > 1000000000000
    ) {
        return res.status(400).json({
            success: false,
            message: "Purchase total is invalid."
        });
    }

    const productIds = cleanItems.map(item => item.productId);
    const placeholders = productIds.map(() => "?").join(", ");

    const purchaseNumber =
        "PUR-" +
        Date.now() +
        "-" +
        crypto.randomBytes(3).toString("hex").toUpperCase();

    const createPurchase = () => {
        db.all(
            `SELECT id, product_name
             FROM products
             WHERE business_id = ?
             AND id IN (${placeholders})`,
            [businessId, ...productIds],
            (productError, products) => {
                if (productError) {
                    return res.status(500).json({
                        success: false,
                        message: "Could not verify purchase products."
                    });
                }

                if (products.length !== cleanItems.length) {
                    return res.status(400).json({
                        success: false,
                        message: "One or more products do not belong to your business."
                    });
                }

                const productMap = new Map(
                    products.map(product => [product.id, product])
                );

                db.serialize(() => {
                    db.run("BEGIN IMMEDIATE TRANSACTION", (beginError) => {
                        if (beginError) {
                            return res.status(500).json({
                                success: false,
                                message: "Could not start purchase transaction."
                            });
                        }

                        let finished = false;

                        const rollback = (status, message) => {
                            if (finished) return;
                            finished = true;

                            db.run("ROLLBACK", () => {
                                res.status(status).json({
                                    success: false,
                                    message
                                });
                            });
                        };

                        // CHECK WHETHER THE SUPPLIER'S MONTH IS CLOSED
                        const savePurchase = () => {
                            db.run(
                                `INSERT INTO purchases (
                                    business_id,
                                    supplier_id,
                                    purchase_number,
                                    total_amount,
                                    purchase_date,
                                    notes,
                                    created_by
                                ) VALUES (
                                    ?, ?, ?, ?,
                                    COALESCE(?, date('now', 'localtime')),
                                    ?, ?
                                )`,
                                [
                                    businessId,
                                    supplierId,
                                    purchaseNumber,
                                    totalAmount,
                                    purchaseDate,
                                    notes,
                                    userId
                                ],
                                function (purchaseError) {
                                    if (purchaseError) {
                                        return rollback(
                                            500,
                                            "Could not save purchase."
                                        );
                                    }

                                    const purchaseId = this.lastID;
                                    let itemIndex = 0;

                                    const saveNextItem = () => {
                                        if (itemIndex >= cleanItems.length) {
                                            if (finished) return;

                                            db.run("COMMIT", (commitError) => {
                                                if (commitError) {
                                                    return rollback(
                                                        500,
                                                        "Could not complete purchase."
                                                    );
                                                }

                                                finished = true;

                                                res.status(201).json({
                                                    success: true,
                                                    message: "Purchase recorded and stock updated successfully.",
                                                    purchase_id: purchaseId,
                                                    purchase_number: purchaseNumber,
                                                    total_amount: totalAmount
                                                });
                                            });

                                            return;
                                        }

                                        const item = cleanItems[itemIndex];
                                        const product = productMap.get(item.productId);

                                        db.run(
                                            `INSERT INTO purchase_items (
                                                purchase_id,
                                                product_id,
                                                product_name,
                                                quantity,
                                                unit_cost,
                                                line_total
                                            ) VALUES (?, ?, ?, ?, ?, ?)`,
                                            [
                                                purchaseId,
                                                item.productId,
                                                product.product_name,
                                                item.quantity,
                                                item.unitCost,
                                                item.lineTotal
                                            ],
                                            (itemError) => {
                                                if (itemError) {
                                                    return rollback(
                                                        500,
                                                        "Could not save purchase items."
                                                    );
                                                }

                                                db.run(
                                                    `UPDATE products
                                                     SET stock_quantity = stock_quantity + ?
                                                     WHERE id = ? AND business_id = ?`,
                                                    [
                                                        item.quantity,
                                                        item.productId,
                                                        businessId
                                                    ],
                                                    function (stockError) {
                                                        if (
                                                            stockError ||
                                                            this.changes !== 1
                                                        ) {
                                                            return rollback(
                                                                500,
                                                                "Could not update product stock."
                                                            );
                                                        }

                                                        itemIndex++;
                                                        saveNextItem();
                                                    }
                                                );
                                            }
                                        );
                                    };

                                    saveNextItem();
                                }
                            );
                        };

                        if (supplierId === null) {
                            return savePurchase();
                        }

                        const selectedDate =
                            purchaseDate ||
                            null;

                        const checkClosedMonth = (dateToCheck) => {
                            db.get(
                                `SELECT id
                                 FROM supplier_month_closures
                                 WHERE business_id = ?
                                   AND supplier_id = ?
                                   AND year = CAST(strftime('%Y', ?) AS INTEGER)
                                   AND month = CAST(strftime('%m', ?) AS INTEGER)`,
                                [
                                    businessId,
                                    supplierId,
                                    dateToCheck,
                                    dateToCheck
                                ],
                                (closureError, closure) => {
                                    if (closureError) {
                                        return rollback(
                                            500,
                                            "Could not check the supplier's month status."
                                        );
                                    }

                                    if (closure) {
                                        return rollback(
                                            409,
                                            "This supplier's month is closed. You cannot add purchases to it."
                                        );
                                    }

                                    savePurchase();
                                }
                            );
                        };

                        if (selectedDate) {
                            return checkClosedMonth(selectedDate);
                        }

                        db.get(
                            "SELECT date('now', 'localtime') AS today",
                            [],
                            (dateError, result) => {
                                if (dateError || !result) {
                                    return rollback(
                                        500,
                                        "Could not determine today's date."
                                    );
                                }

                                checkClosedMonth(result.today);
                            }
                        );
                    });
                });
            }
        );
    };

    // VERIFY SUPPLIER BELONGS TO THIS BUSINESS
    if (supplierId === null) {
        return createPurchase();
    }

    db.get(
        `SELECT id
         FROM suppliers
         WHERE id = ? AND business_id = ?`,
        [supplierId, businessId],
        (supplierError, supplier) => {
            if (supplierError) {
                return res.status(500).json({
                    success: false,
                    message: "Could not verify supplier."
                });
            }

            if (!supplier) {
                return res.status(400).json({
                    success: false,
                    message: "Supplier not found in your business."
                });
            }

            createPurchase();
        }
    );
});

module.exports = router;