
"use strict";

const express = require("express");
const crypto = require("crypto");
const pool = require("../config/postgresDatabase");
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
router.get("/options", async (req, res) => {
    try {
        const businessId = req.session.user.business_id;

        const [productResult, supplierResult] = await Promise.all([
            pool.query(
                `SELECT id, product_name, buying_price, stock_quantity
                 FROM products
                 WHERE business_id = $1
                 ORDER BY product_name ASC`,
                [businessId]
            ),
            pool.query(
                `SELECT id, supplier_name, phone
                 FROM suppliers
                 WHERE business_id = $1
                 ORDER BY supplier_name ASC`,
                [businessId]
            )
        ]);

        return res.json({
            success: true,
            products: productResult.rows,
            suppliers: supplierResult.rows
        });

    } catch (error) {
        console.error("Purchase options error:", error.message);

        return res.status(500).json({
            success: false,
            message: "Could not load purchase options."
        });
    }
});

// GET PURCHASE HISTORY
router.get("/", async (req, res) => {
    try {
        const businessId = req.session.user.business_id;

        const result = await pool.query(
            `SELECT
                p.id,
                p.purchase_number,
                p.total_amount,
                p.purchase_date,
                p.notes,
                s.supplier_name
             FROM purchases p
             LEFT JOIN suppliers s ON s.id = p.supplier_id
             WHERE p.business_id = $1
             ORDER BY p.id DESC`,
            [businessId]
        );

        return res.json({
            success: true,
            purchases: result.rows
        });

    } catch (error) {
        console.error("Purchase history error:", error.message);

        return res.status(500).json({
            success: false,
            message: "Could not load purchase history."
        });
    }
});

// GET PURCHASE DETAILS
router.get("/:id", async (req, res) => {
    try {
        const businessId = req.session.user.business_id;
        const purchaseId = Number(req.params.id);

        if (!Number.isInteger(purchaseId) || purchaseId <= 0) {
            return res.status(400).json({
                success: false,
                message: "Invalid purchase ID."
            });
        }

        const purchaseResult = await pool.query(
            `SELECT
                p.*,
                s.supplier_name,
                s.phone AS supplier_phone
             FROM purchases p
             LEFT JOIN suppliers s ON s.id = p.supplier_id
             WHERE p.id = $1 AND p.business_id = $2`,
            [purchaseId, businessId]
        );

        const purchase = purchaseResult.rows[0];

        if (!purchase) {
            return res.status(404).json({
                success: false,
                message: "Purchase not found."
            });
        }

        const itemsResult = await pool.query(
            `SELECT
                id,
                product_id,
                product_name,
                quantity,
                unit_cost,
                line_total
             FROM purchase_items
             WHERE purchase_id = $1
             ORDER BY id ASC`,
            [purchaseId]
        );

        return res.json({
            success: true,
            purchase,
            items: itemsResult.rows
        });

    } catch (error) {
        console.error("Purchase details error:", error.message);

        return res.status(500).json({
            success: false,
            message: "Could not load purchase."
        });
    }
});

// CREATE A PURCHASE AND INCREASE STOCK
router.post("/", async (req, res) => {
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

    if (purchaseDate !== null && !isValidDate(purchaseDate)) {
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

    const purchaseNumber =
        "PUR-" +
        Date.now() +
        "-" +
        crypto.randomBytes(3).toString("hex").toUpperCase();

    const client = await pool.connect();
    let transactionStarted = false;

    try {
        await client.query("BEGIN");
        transactionStarted = true;

        // VERIFY AND LOCK THE SUPPLIER, IF PROVIDED
        if (supplierId !== null) {
            const supplierResult = await client.query(
                `SELECT id
                 FROM suppliers
                 WHERE id = $1 AND business_id = $2
                 FOR UPDATE`,
                [supplierId, businessId]
            );

            if (supplierResult.rowCount !== 1) {
                await client.query("ROLLBACK");
                transactionStarted = false;

                return res.status(400).json({
                    success: false,
                    message: "Supplier not found in your business."
                });
            }
        }

        // VERIFY AND LOCK ALL PRODUCTS BELONGING TO THIS BUSINESS
        const productResult = await client.query(
            `SELECT id, product_name
             FROM products
             WHERE business_id = $1
               AND id = ANY($2::int[])
             ORDER BY id
             FOR UPDATE`,
            [businessId, productIds]
        );

        if (productResult.rows.length !== cleanItems.length) {
            await client.query("ROLLBACK");
            transactionStarted = false;

            return res.status(400).json({
                success: false,
                message: "One or more products do not belong to your business."
            });
        }

        const productMap = new Map(
            productResult.rows.map(product => [
                Number(product.id),
                product
            ])
        );

        // CHECK WHETHER THE SUPPLIER'S MONTH IS CLOSED
        if (supplierId !== null) {
            const closureResult = await client.query(
                `SELECT id
                 FROM supplier_month_closures
                 WHERE business_id = $1
                   AND supplier_id = $2
                   AND year = EXTRACT(
                       YEAR FROM COALESCE($3::date, CURRENT_DATE)
                   )::integer
                   AND month = EXTRACT(
                       MONTH FROM COALESCE($3::date, CURRENT_DATE)
                   )::integer
                 LIMIT 1`,
                [businessId, supplierId, purchaseDate]
            );

            if (closureResult.rowCount > 0) {
                await client.query("ROLLBACK");
                transactionStarted = false;

                return res.status(409).json({
                    success: false,
                    message: "This supplier's month is closed. You cannot add purchases to it."
                });
            }
        }

        // CREATE PURCHASE
        const purchaseResult = await client.query(
            `INSERT INTO purchases (
                business_id,
                supplier_id,
                purchase_number,
                total_amount,
                purchase_date,
                notes,
                created_by
             ) VALUES (
                $1, $2, $3, $4,
                COALESCE($5::date, CURRENT_DATE),
                $6, $7
             )
             RETURNING id`,
            [
                businessId,
                supplierId,
                purchaseNumber,
                totalAmount,
                purchaseDate,
                notes,
                userId
            ]
        );

        const purchaseId = purchaseResult.rows[0].id;

        // SAVE ITEMS AND INCREASE STOCK
        for (const item of cleanItems) {
            const product = productMap.get(item.productId);

            await client.query(
                `INSERT INTO purchase_items (
                    purchase_id,
                    product_id,
                    product_name,
                    quantity,
                    unit_cost,
                    line_total
                 ) VALUES ($1, $2, $3, $4, $5, $6)`,
                [
                    purchaseId,
                    item.productId,
                    product.product_name,
                    item.quantity,
                    item.unitCost,
                    item.lineTotal
                ]
            );

            const stockResult = await client.query(
                `UPDATE products
                 SET stock_quantity = stock_quantity + $1
                 WHERE id = $2 AND business_id = $3`,
                [
                    item.quantity,
                    item.productId,
                    businessId
                ]
            );

            if (stockResult.rowCount !== 1) {
                throw new Error("Could not update product stock.");
            }
        }

        await client.query("COMMIT");
        transactionStarted = false;

        return res.status(201).json({
            success: true,
            message: "Purchase recorded and stock updated successfully.",
            purchase_id: purchaseId,
            purchase_number: purchaseNumber,
            total_amount: totalAmount
        });

    } catch (error) {
        if (transactionStarted) {
            try {
                await client.query("ROLLBACK");
            } catch (rollbackError) {
                console.error("Purchase rollback error:", rollbackError.message);
            }
        }

        console.error("Purchase creation error:", error.message);

        return res.status(500).json({
            success: false,
            message: "Could not complete purchase."
        });

    } finally {
        client.release();
    }
});

module.exports = router;
