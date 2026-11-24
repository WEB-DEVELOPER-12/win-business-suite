
const { Pool } = require("pg");

if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is missing from .env.");
}

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    connectionTimeoutMillis: 30000,
    max: 5
});

pool.on("error", error => {
    console.error("PostgreSQL pool error:", error.message);
});

pool.ready = (async () => {
    const client = await pool.connect();

    try {
        await client.query("SELECT 1");
        console.log("WIN Business Suite PostgreSQL connection successful.");
    } finally {
        client.release();
    }
})();

module.exports = pool;
