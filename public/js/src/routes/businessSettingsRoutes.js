const express = require("express");
const router = express.Router();

const db = require("../config/database");
const requireAuth = require("../middleware/requireAuth");

// GET BUSINESS SETTINGS
router.get("/", requireAuth, (req, res) => {
    const businessId = req.session.user.business_id;

    db.get(
        `SELECT
            id,
            business_name,
            business_type,
            email,
            phone,
            country,
            currency
         FROM businesses
         WHERE id = ?`,
        [businessId],
        (error, business) => {
            if (error) {
                return res.status(500).json({
                    success: false,
                    message: "Could not load business settings."
                });
            }

            if (!business) {
                return res.status(404).json({
                    success: false,
                    message: "Business not found."
                });
            }

            res.json({
                success: true,
                business
            });
        }
    );
});

// UPDATE BUSINESS SETTINGS
router.put("/", requireAuth, (req, res) => {
    const businessId = req.session.user.business_id;

    const {
        business_name,
        business_type,
        email,
        phone,
        country,
        currency
    } = req.body;

    if (
        typeof business_name !== "string" ||
        !business_name.trim() ||
        typeof business_type !== "string" ||
        !business_type.trim()
    ) {
        return res.status(400).json({
            success: false,
            message: "Business name and business type are required."
        });
    }

    const cleanName = business_name.trim();
    const cleanType = business_type.trim();

    if (cleanName.length > 100 || cleanType.length > 100) {
        return res.status(400).json({
            success: false,
            message: "Business name or type is too long."
        });
    }

    const cleanEmail = typeof email === "string" ? email.trim() : "";
    const cleanPhone = typeof phone === "string" ? phone.trim() : "";
    const cleanCountry = typeof country === "string" ? country.trim() : "Kenya";
    const cleanCurrency = typeof currency === "string" ? currency.trim().toUpperCase() : "KES";

    if (cleanEmail.length > 254 || cleanPhone.length > 30 ||
        cleanCountry.length > 100 || cleanCurrency.length > 10) {
        return res.status(400).json({
            success: false,
            message: "One or more business details are too long."
        });
    }

    db.run(
        `UPDATE businesses
         SET business_name = ?,
             business_type = ?,
             email = ?,
             phone = ?,
             country = ?,
             currency = ?
         WHERE id = ?`,
        [
            cleanName,
            cleanType,
            cleanEmail || null,
            cleanPhone || null,
            cleanCountry || "Kenya",
            cleanCurrency || "KES",
            businessId
        ],
        function (error) {
            if (error) {
                return res.status(500).json({
                    success: false,
                    message: "Could not update business settings."
                });
            }

            if (this.changes === 0) {
                return res.status(404).json({
                    success: false,
                    message: "Business not found."
                });
            }

            res.json({
                success: true,
                message: "Business settings updated successfully."
            });
        }
    );
});

module.exports = router;