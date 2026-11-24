
require("dotenv").config();

const express = require("express");
const path = require("path");
const session = require("express-session");

const db = require("./src/config/initDatabase");

const authRoutes = require("./src/routes/authRoutes");
const inventoryRoutes = require("./src/routes/inventoryRoutes");
const purchaseRoutes = require("./src/routes/purchaseRoutes");
const supplierRoutes = require("./src/routes/supplierRoutes");
const businessSettingsRoutes = require("./src/routes/businessSettingsRoutes");
const subscriptionRoutes = require("./src/routes/subscriptionRoutes");
const categoryRoutes = require("./src/routes/categoryRoutes");
const debtorRoutes = require("./src/routes/debtorRoutes");
const debtorNotebookRoutes = require("./src/routes/debtorNotebookRoutes");

const app = express();
const PORT = process.env.PORT || 3000;

app.disable("x-powered-by");

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(session({
    name: "win.sid",
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        maxAge: 1000 * 60 * 60 * 8
    }
}));

app.use(express.static(path.join(__dirname, "public")));

app.use("/api/auth", authRoutes);
app.use("/api/inventory", inventoryRoutes);
app.use("/api/purchases", purchaseRoutes);
app.use("/api/suppliers", supplierRoutes);
app.use("/api/business-settings", businessSettingsRoutes);
app.use("/api/subscription", subscriptionRoutes);
app.use("/api/categories", categoryRoutes);

// Register specific notebook routes BEFORE general debtor routes.
app.use("/api/debtors", debtorNotebookRoutes);
app.use("/api/debtors", debtorRoutes);

app.get("/api/health", (req, res) => {
    res.json({
        success: true,
        message: "WIN Business Suite server is running!",
        status: "healthy",
        environment: process.env.NODE_ENV || "development"
    });
});

app.listen(PORT, "0.0.0.0", () => {
    console.log("==================================");
    console.log("       WIN BUSINESS SUITE");
    console.log("==================================");
    console.log(`Server running on port ${PORT}`);
    console.log(`Environment: ${process.env.NODE_ENV || "development"}`);
});
