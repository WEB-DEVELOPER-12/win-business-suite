
const sqlite3 = require("sqlite3").verbose();
const path = require("path");

// Use a separate database only when WIN_DATABASE_PATH is provided.
// Otherwise, continue using the normal WIN Business Suite database.
const databasePath = process.env.WIN_DATABASE_PATH
    ? path.resolve(process.cwd(), process.env.WIN_DATABASE_PATH)
    : path.join(__dirname, "../../win-business-suite.db");

const db = new sqlite3.Database(databasePath, error => {
    if (error) {
        console.error("Database connection failed:", error.message);
    } else {
        console.log("Connected to WIN Business Suite database:", databasePath);
    }
});

db.run("PRAGMA foreign_keys = ON");

module.exports = db;
