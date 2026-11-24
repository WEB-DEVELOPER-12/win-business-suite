
const db = require("./database");

function getColumns(tableName) {
    return new Promise((resolve, reject) => {
        db.all(`PRAGMA table_info(${tableName})`, (error, columns) => {
            if (error) return reject(error);
            resolve(columns.map(column => column.name));
        });
    });
}

function addColumn(sql) {
    return new Promise((resolve, reject) => {
        db.run(sql, error => {
            if (error) return reject(error);
            resolve();
        });
    });
}

async function upgradeSettingsColumns() {
    const upgrades = [
        {
            table: "users",
            name: "phone",
            sql: "ALTER TABLE users ADD COLUMN phone TEXT"
        },
        {
            table: "businesses",
            name: "address",
            sql: "ALTER TABLE businesses ADD COLUMN address TEXT"
        },
        {
            table: "businesses",
            name: "registration_number",
            sql: "ALTER TABLE businesses ADD COLUMN registration_number TEXT"
        },
        {
            table: "businesses",
            name: "logo_url",
            sql: "ALTER TABLE businesses ADD COLUMN logo_url TEXT"
        }
    ];

    for (const upgrade of upgrades) {
        const columns = await getColumns(upgrade.table);

        if (columns.includes(upgrade.name)) {
            continue;
        }

        await addColumn(upgrade.sql);

        console.log(
            `Settings database column added: ${upgrade.table}.${upgrade.name}`
        );
    }

    console.log("WIN Settings database migration completed.");
}

module.exports = upgradeSettingsColumns;
