require("dotenv").config();

const { Client } = require("pg");

async function testConnection() {
    const client = new Client({
        connectionString: process.env.DATABASE_URL,
        connectionTimeoutMillis: 15000
    });

    try {
        await client.connect();

        const result = await client.query(
            "SELECT version() AS version, current_database() AS database"
        );

        console.log("POSTGRESQL CONNECTION: SUCCESS");
        console.log("DATABASE:", result.rows[0].database);
        console.log("VERSION:", result.rows[0].version);
    } catch (error) {
        console.error("POSTGRESQL CONNECTION: FAILED");
        console.error(error.message);
        process.exitCode = 1;
    } finally {
        await client.end().catch(() => {});
    }
}

testConnection();
