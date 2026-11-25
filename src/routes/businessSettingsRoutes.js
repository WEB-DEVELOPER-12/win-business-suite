
"use strict";

const express = require("express");
const pool = require("../config/postgresDatabase");
const requireAuth = require("../middleware/requireAuth");

const router = express.Router();

// GET BUSINESS SETTINGS
router.get("/", requireAuth, async (req, res) => {
    try {
        const businessId = req.session.user.business_id;

        const result = await pool.query(
            `SELECT
                id,
                business_name,
                business_type,
                email,
                phone,
                country,
                currency,
                address,
                registration_number
             FROM businesses
             WHERE id = $1`,
            [businessId]
        );

        const business = result.rows[0];

        if (!business) {
            return res.status(404).json({
                success: false,
                message: "Business not found."
            });
        }

        return res.json({
            success: true,
            business
        });

    } catch (error) {
        console.error(
            "Business settings load error:",
            error.message
        );

        return res.status(500).json({
            success: false,
            message: "Could not load business settings."
        });
    }
});

// UPDATE BUSINESS SETTINGS
router.put("/", requireAuth, async (req, res) => {
    try {
        const businessId = req.session.user.business_id;

        const {
            business_name,
            business_type,
            email,
            phone,
            country,
            currency,
            address,
            registration_number
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
        const cleanEmail = typeof email === "string" ? email.trim() : "";
        const cleanPhone = typeof phone === "string" ? phone.trim() : "";
        const cleanCountry = typeof country === "string" ? country.trim() : "Kenya";
        const cleanCurrency = typeof currency === "string"
            ? currency.trim().toUpperCase()
            : "KES";
        const cleanAddress = typeof address === "string" ? address.trim() : "";
        const cleanRegistration = typeof registration_number === "string"
            ? registration_number.trim()
            : "";

        if (
            cleanName.length > 100 ||
            cleanType.length > 100 ||
            cleanEmail.length > 254 ||
            cleanPhone.length > 30 ||
            cleanCountry.length > 100 ||
            cleanCurrency.length > 10 ||
            cleanAddress.length > 300 ||
            cleanRegistration.length > 100
        ) {
            return res.status(400).json({
                success: false,
                message: "One or more business details are too long."
            });
        }

        if (
            cleanEmail &&
            !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)
        ) {
            return res.status(400).json({
                success: false,
                message: "Please enter a valid business email address."
            });
        }

        const result = await pool.query(
            `UPDATE businesses
             SET business_name = $1,
                 business_type = $2,
                 email = $3,
                 phone = $4,
                 country = $5,
                 currency = $6,
                 address = $7,
                 registration_number = $8
             WHERE id = $9
             RETURNING id`,
            [
                cleanName,
                cleanType,
                cleanEmail || null,
                cleanPhone || null,
                cleanCountry || "Kenya",
                cleanCurrency || "KES",
                cleanAddress || null,
                cleanRegistration || null,
                businessId
            ]
        );

        if (result.rowCount === 0) {
            return res.status(404).json({
                success: false,
                message: "Business not found."
            });
        }

        return res.json({
            success: true,
            message: "Business settings updated successfully."
        });

    } catch (error) {
        console.error(
            "Business settings update error:",
            error.message
        );

        return res.status(500).json({
            success: false,
            message: "Could not update business settings."
        });
    }
});

module.exports = router;
