const express = require("express");
const bcrypt = require("bcryptjs");

const router = express.Router();
const pool = require("../config/postgresDatabase");
const requireAuth = require("../middleware/requireAuth");

router.use(requireAuth);

// ========================================
// GET MY PROFILE
// ========================================

router.get("/profile", async (req, res) => {
    try {
        const userId = Number(req.session.user.id);

        const result = await pool.query(
            `SELECT
                id,
                full_name,
                email,
                phone,
                role,
                created_at
             FROM users
             WHERE id = $1`,
            [userId]
        );

        const user = result.rows[0];

        if (!user) {
            return res.status(404).json({
                success: false,
                message: "User account not found."
            });
        }

        return res.json({
            success: true,
            user
        });
    } catch (error) {
        console.error("Profile loading error:", error.message);

        return res.status(500).json({
            success: false,
            message: "Could not load your profile."
        });
    }
});

// ========================================
// UPDATE MY PROFILE
// ========================================

router.put("/profile", async (req, res) => {
    try {
        const userId = Number(req.session.user.id);

        const {
            full_name,
            email,
            phone
        } = req.body;

        if (
            typeof full_name !== "string" ||
            !full_name.trim() ||
            typeof email !== "string" ||
            !email.trim()
        ) {
            return res.status(400).json({
                success: false,
                message: "Full name and email are required."
            });
        }

        const cleanName = full_name.trim();
        const cleanEmail = email.trim().toLowerCase();
        const cleanPhone = typeof phone === "string"
            ? phone.trim()
            : "";

        if (cleanName.length > 100) {
            return res.status(400).json({
                success: false,
                message: "Full name is too long."
            });
        }

        if (
            cleanEmail.length > 254 ||
            !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)
        ) {
            return res.status(400).json({
                success: false,
                message: "Enter a valid email address."
            });
        }

        if (cleanPhone.length > 30) {
            return res.status(400).json({
                success: false,
                message: "Phone number is too long."
            });
        }

        const result = await pool.query(
            `UPDATE users
             SET full_name = $1,
                 email = $2,
                 phone = $3
             WHERE id = $4
               AND NOT EXISTS (
                   SELECT 1
                   FROM users existing
                   WHERE existing.email = $2
                     AND existing.id <> $4
               )
             RETURNING id`,
            [
                cleanName,
                cleanEmail,
                cleanPhone || null,
                userId
            ]
        );

        if (result.rowCount === 0) {
            const existingUser = await pool.query(
                `SELECT id
                 FROM users
                 WHERE email = $1
                   AND id <> $2`,
                [cleanEmail, userId]
            );

            if (existingUser.rowCount > 0) {
                return res.status(409).json({
                    success: false,
                    message: "This email address is already in use."
                });
            }

            return res.status(404).json({
                success: false,
                message: "User account not found."
            });
        }

        req.session.user.full_name = cleanName;
        req.session.user.email = cleanEmail;

        return res.json({
            success: true,
            message: "Your profile was updated successfully."
        });
    } catch (error) {
        console.error("Profile update error:", error.message);

        if (error.code === "23505") {
            return res.status(409).json({
                success: false,
                message: "This email address is already in use."
            });
        }

        return res.status(500).json({
            success: false,
            message: "Could not update your profile."
        });
    }
});

// ========================================
// CHANGE PASSWORD
// ========================================

router.post("/password", async (req, res) => {
    try {
        const userId = Number(req.session.user.id);

        const {
            current_password,
            new_password
        } = req.body;

        if (
            typeof current_password !== "string" ||
            typeof new_password !== "string" ||
            !current_password ||
            !new_password
        ) {
            return res.status(400).json({
                success: false,
                message: "Enter your current and new passwords."
            });
        }

        if (new_password.length < 12 || new_password.length > 128) {
            return res.status(400).json({
                success: false,
                message: "Your new password must contain 12 to 128 characters."
            });
        }

        const result = await pool.query(
            `SELECT password_hash
             FROM users
             WHERE id = $1`,
            [userId]
        );

        const user = result.rows[0];

        if (!user) {
            return res.status(404).json({
                success: false,
                message: "User account not found."
            });
        }

        const passwordMatches = await bcrypt.compare(
            current_password,
            user.password_hash
        );

        if (!passwordMatches) {
            return res.status(400).json({
                success: false,
                message: "Your current password is incorrect."
            });
        }

        const newHash = await bcrypt.hash(new_password, 12);

        const updateResult = await pool.query(
            `UPDATE users
             SET password_hash = $1
             WHERE id = $2
             RETURNING id`,
            [newHash, userId]
        );

        if (updateResult.rowCount === 0) {
            return res.status(404).json({
                success: false,
                message: "User account not found."
            });
        }

        return res.json({
            success: true,
            message: "Your password was changed successfully."
        });
    } catch (error) {
        console.error("Password processing error:", error.message);

        return res.status(500).json({
            success: false,
            message: "A password processing error occurred."
        });
    }
});

module.exports = router;