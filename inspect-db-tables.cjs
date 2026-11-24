const sqlite3 = require("sqlite3").verbose();

const db = new sqlite3.Database(
    "./win-business-suite.db",
    sqlite3.OPEN_READONLY
);

db.all(
    "SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name",
    (error, rows) => {
        if (error) {
            console.error(error.message);
        } else {
            console.log("WIN BUSINESS SUITE DATABASE TABLES:");
            rows
                .filter(row => !row.name.startsWith("sqlite_"))
                .forEach((row, index) => {
                    console.log(`${index + 1}. ${row.name}`);
                });
        }

        db.close();
    }
);
