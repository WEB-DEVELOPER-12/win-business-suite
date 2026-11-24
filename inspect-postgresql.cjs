require("dotenv").config();
const { Client } = require("pg");

async function inspect() {
    const client = new Client({
        connectionString: process.env.DATABASE_URL,
        connectionTimeoutMillis: 15000
    });

    try {
        await client.connect();

        const result = await client.query(`
            SELECT tablename
            FROM pg_tables
            WHERE schemaname = 'public'
            ORDER BY tablename
        `);

        console.log("EXISTING POSTGRESQL TABLES:", result.rows.length);
        result.rows.forEach((row, index) => {
            console.log(`${index + 1}. ${row.tablename}`);
        });
    } catch (error) {
        console.error("INSPECTION FAILED:", error.message);
    } finally {
        await client.end().catch(() => {});
    }
}

inspect();
