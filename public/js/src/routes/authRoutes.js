
const express = require("express");
const bcrypt = require("bcryptjs");
const db = require("../config/database");

const router = express.Router();

// REGISTER
router.post("/register", async (req, res) => {
    try {
        const {
            business_name,
            business_type,
            full_name,
            email,
            password
        } = req.body;

        if (
            !business_name ||
            !business_type ||
            !full_name ||
            !email ||
            !password
        ) {
            return res.status(400).json({
                success: false,
                message: "All fields are required."
            });
        }

        if (
            typeof password !== "string" ||
            password.length < 12 ||
            password.length > 128
        ) {
            return res.status(400).json({
                success: false,
                message: "Password must contain 12 to 128 characters."
            });
        }

        if (
            typeof business_name !== "string" ||
            typeof business_type !== "string" ||
            typeof full_name !== "string" ||
            typeof email !== "string"
        ) {
            return res.status(400).json({
                success: false,
                message: "Invalid registration details."
            });
        }

        const cleanBusinessName = business_name.trim();
        const cleanBusinessType = business_type.trim();
        const cleanFullName = full_name.trim();
        const normalizedEmail = email.trim().toLowerCase();

        if (
            !cleanBusinessName ||
            !cleanBusinessType ||
            !cleanFullName ||
            !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)
        ) {
            return res.status(400).json({
                success: false,
                message: "Please provide valid registration details."
            });
        }

        const passwordHash = await bcrypt.hash(password, 12);

        db.serialize(() => {
            db.run("BEGIN TRANSACTION");

            db.run(
                `INSERT INTO businesses (business_name, business_type)
                 VALUES (?, ?)`,
                [cleanBusinessName, cleanBusinessType],
                function (error) {
                    if (error) {
                        return db.run("ROLLBACK", () => {
                            res.status(500).json({
                                success: false,
                                message: "Could not create business."
                            });
                        });
                    }

                    const businessId = this.lastID;

                    db.run(
                        `INSERT INTO users
                         (business_id, full_name, email, password_hash, role)
                         VALUES (?, ?, ?, ?, 'owner')`,
                        [
                            businessId,
                            cleanFullName,
                            normalizedEmail,
                            passwordHash
                        ],
                        function (userError) {
                            if (userError) {
                                return db.run("ROLLBACK", () => {
                                    res.status(409).json({
                                        success: false,
                                        message: "Registration failed. This email may already be registered."
                                    });
                                });
                            }

                            // Create the business's 15-day WIN Pro trial
                            db.run(
                                `INSERT INTO subscriptions (
                                    business_id,
                                    plan_name,
                                    status,
                                    trial_started_at,
                                    trial_ends_at
                                )
                                VALUES (
                                    ?,
                                    'WIN Pro',
                                    'trial',
                                    CURRENT_TIMESTAMP,
                                    datetime('now', '+15 days')
                                )`,
                                [businessId],
                                (subscriptionError) => {
                                    if (subscriptionError) {
                                        console.error(
                                            "Trial creation error:",
                                            subscriptionError.message
                                        );

                                        return db.run("ROLLBACK", () => {
                                            res.status(500).json({
                                                success: false,
                                                message: "Could not activate your free trial. Please try again."
                                            });
                                        });
                                    }

                                    db.run("COMMIT", (commitError) => {
                                        if (commitError) {
                                            return db.run("ROLLBACK", () => {
                                                res.status(500).json({
                                                    success: false,
                                                    message: "Could not complete registration."
                                                });
                                            });
                                        }

                                        res.status(201).json({
                                            success: true,
                                            message: "Business account created successfully. Your 15-day WIN Pro trial has started!",
                                            business_id: businessId,
                                            trial: {
                                                plan: "WIN Pro",
                                                duration_days: 15,
                                                status: "trial"
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

    } catch (error) {
        console.error("Registration error:", error.message);

        res.status(500).json({
            success: false,
            message: "An unexpected error occurred."
        });
    }
});

// LOGIN
router.post("/login", (req, res) => {
    const { email, password } = req.body;

    if (
        typeof email !== "string" ||
        typeof password !== "string" ||
        !email.trim() ||
        !password
    ) {
        return res.status(400).json({
            success: false,
            message: "Email and password are required."
        });
    }

    const normalizedEmail = email.trim().toLowerCase();

    db.get(
        `SELECT id, business_id, full_name, email, password_hash, role
         FROM users
         WHERE email = ?`,
        [normalizedEmail],
        async (error, user) => {
            if (error) {
                return res.status(500).json({
                    success: false,
                    message: "Login could not be completed."
                });
            }

            if (!user) {
                return res.status(401).json({
                    success: false,
                    message: "Invalid email or password."
                });
            }

            try {
                const passwordMatches = await bcrypt.compare(
                    password,
                    user.password_hash
                );

                if (!passwordMatches) {
                    return res.status(401).json({
                        success: false,
                        message: "Invalid email or password."
                    });
                }

                req.session.regenerate((sessionError) => {
                    if (sessionError) {
                        return res.status(500).json({
                            success: false,
                            message: "Could not start your session."
                        });
                    }

                    req.session.user = {
                        id: user.id,
                        business_id: user.business_id,
                        full_name: user.full_name,
                        email: user.email,
                        role: user.role
                    };

                    req.session.save((saveError) => {
                        if (saveError) {
                            return res.status(500).json({
                                success: false,
                                message: "Could not save your session."
                            });
                        }

                        res.json({
                            success: true,
                            message: "Login successful.",
                            user: req.session.user
                        });
                    });
                });

            } catch (compareError) {
                res.status(500).json({
                    success: false,
                    message: "Login could not be completed."
                });
            }
        }
    );
});

// CHECK CURRENT SESSION AND BUSINESS NAME
router.get("/me", (req, res) => {
    if (!req.session.user) {
        return res.status(401).json({
            success: false,
            message: "You are not logged in."
        });
    }

    const userId = req.session.user.id;
    const businessId = req.session.user.business_id;

    db.get(
        `SELECT
            users.id,
            users.business_id,
            users.full_name,
            users.email,
            users.role,
            businesses.business_name
         FROM users
         INNER JOIN businesses
            ON users.business_id = businesses.id
         WHERE users.id = ?
         AND users.business_id = ?`,
        [userId, businessId],
        (error, user) => {
            if (error) {
                return res.status(500).json({
                    success: false,
                    message: "Could not load account information."
                });
            }

            if (!user) {
                return res.status(401).json({
                    success: false,
                    message: "Account not found."
                });
            }

            res.json({
                success: true,
                user
            });
        }
    );
});

// LOGOUT
router.post("/logout", (req, res) => {
    req.session.destroy((error) => {
        if (error) {
            return res.status(500).json({
                success: false,
                message: "Could not log out."
            });
        }

        res.clearCookie("win.sid", {
            httpOnly: true,
            secure: process.env.NODE_ENV === "production",
            sameSite: "lax"
        });

        res.json({
            success: true,
            message: "Logged out successfully."
        });
    });
});

module.exports = router;
