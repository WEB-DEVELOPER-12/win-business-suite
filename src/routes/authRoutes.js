
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
            db.run("BEGIN TRANSACTION", beginError => {
                if (beginError) {
                    return res.status(500).json({
                        success: false,
                        message: "Could not begin registration."
                    });
                }

                db.run(
                    `INSERT INTO businesses (business_name, business_type)
                     VALUES (?, ?)`,
                    [cleanBusinessName, cleanBusinessType],
                    function (businessError) {
                        if (businessError) {
                            return rollbackWithResponse(
                                "Could not create business.",
                                500
                            );
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
                                    return rollbackWithResponse(
                                        "Registration failed. This email may already be registered.",
                                        409
                                    );
                                }

                                // Create a pending subscription.
                                // The free trial starts only when the user
                                // explicitly clicks Start my free trial.
                                db.run(
                                    `INSERT INTO subscriptions (
                                        business_id,
                                        plan_name,
                                        status,
                                        trial_started_at,
                                        trial_ends_at
                                    )
                                    VALUES (?, 'WIN Pro', 'pending', NULL, NULL)`,
                                    [businessId],
                                    subscriptionError => {
                                        if (subscriptionError) {
                                            console.error(
                                                "Pending subscription creation error:",
                                                subscriptionError.message
                                            );

                                            return rollbackWithResponse(
                                                "Could not complete subscription setup.",
                                                500
                                            );
                                        }

                                        db.run("COMMIT", commitError => {
                                            if (commitError) {
                                                return db.run(
                                                    "ROLLBACK",
                                                    () => {
                                                        res.status(500).json({
                                                            success: false,
                                                            message: "Could not complete registration."
                                                        });
                                                    }
                                                );
                                            }

                                            res.status(201).json({
                                                success: true,
                                                message: "Your business account has been created successfully. Please log in to start your 7-day WIN Pro free trial.",
                                                business_id: businessId,
                                                subscription: {
                                                    plan: "WIN Pro",
                                                    status: "pending",
                                                    trial_started: false,
                                                    duration_days: 7
                                                }
                                            });
                                        });
                                    }
                                );
                            }
                        );
                    }
                );

                function rollbackWithResponse(message, statusCode) {
                    db.run("ROLLBACK", rollbackError => {
                        if (rollbackError) {
                            console.error(
                                "Registration rollback error:",
                                rollbackError.message
                            );
                        }

                        if (!res.headersSent) {
                            res.status(statusCode).json({
                                success: false,
                                message
                            });
                        }
                    });
                }
            });
        });
    } catch (error) {
        console.error("Registration error:", error.message);

        if (!res.headersSent) {
            res.status(500).json({
                success: false,
                message: "An unexpected error occurred."
            });
        }
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

                req.session.regenerate(sessionError => {
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

                    req.session.save(saveError => {
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
    req.session.destroy(error => {
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
