const sqlite3 = require("sqlite3").verbose();
const db = new sqlite3.Database("./win-business-suite.db", sqlite3.OPEN_READONLY);

db.all(
    "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
    async (error, tables) => {
        if (error) {
            console.error(error.message);
            db.close();
            return;
        }

        console.log("WIN BUSINESS SUITE — RECORD COUNTS");
        for (const table of tables) {
            await new Promise(resolve => {
                db.get(`SELECT COUNT(*) AS total FROM "${table.name}"`, (err, row) => {
                    console.log(`${table.name}: ${err ? err.message : row.total}`);
                    resolve();
                });
            });
        }

        db.close();
    }
);
