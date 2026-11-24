const fs = require("fs");
const sqlite3 = require("sqlite3").verbose();

const db = new sqlite3.Database(
    "./win-business-suite.db",
    sqlite3.OPEN_READONLY
);

db.all(
    "SELECT type, name, tbl_name, sql FROM sqlite_master WHERE sql IS NOT NULL AND name NOT LIKE 'sqlite_%' ORDER BY type, name",
    (error, rows) => {
        if (error) {
            console.error(error.message);
            db.close();
            return;
        }

        const schema = rows.map(row =>
            `-- ${row.type}: ${row.name}\n${row.sql};`
        ).join("\n\n");

        fs.writeFileSync(
            "./backups/sqlite-schema-before-postgresql.sql",
            schema,
            "utf8"
        );

        console.log("Schema snapshot created successfully.");
        console.log("Objects exported:", rows.length);
        console.log("File: backups/sqlite-schema-before-postgresql.sql");

        db.close();
    }
);
