require("dotenv").config();

try {
    const url = new URL(process.env.DATABASE_URL);

    console.log("Connection configuration:");
    console.log("Protocol:", url.protocol);
    console.log("Hostname:", url.hostname);
    console.log("Port:", url.port || "default");
    console.log("Database:", url.pathname.slice(1));
    console.log("SSL mode:", url.searchParams.get("sslmode") || "not specified");
    console.log("Username present:", Boolean(url.username));
    console.log("Password present:", Boolean(url.password));
} catch (error) {
    console.log("DATABASE_URL format could not be parsed.");
    console.log(error.message);
}
