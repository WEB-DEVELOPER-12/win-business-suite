const sqlite3 = require("sqlite3").verbose();

const db = new sqlite3.Database(
    "./win-business-suite.db",
    sqlite3.OPEN_READONLY
);

db.get("PRAGMA integrity_check", (error, result) => {
    if (error) {
        console.error("Integrity check error:", error.message);
        db.close();
        return;
    }

    console.log("DATABASE INTEGRITY:", result.integrity_check);

    db.all("PRAGMA foreign_key_check", (fkError, rows) => {
        if (fkError) {
            console.error("Foreign key check error:", fkError.message);
        } else {
            console.log("FOREIGN KEY VIOLATIONS:", rows.length);
            if (rows.length > 0) console.log(rows);
        }

        db.close();
    });
});
