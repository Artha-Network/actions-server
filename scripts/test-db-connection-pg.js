/**
 * Database connection test using pg with relaxed SSL (works around Windows TLS errors).
 * Run: npm run test:db:pg
 * Use this if npm run test:db fails with "security package" on Windows.
 */
require("dotenv").config();
const { Client } = require("pg");

async function main() {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    console.error("Missing DATABASE_URL in .env");
    process.exit(1);
  }

  const client = new Client({
    connectionString: dbUrl,
    ssl: { rejectUnauthorized: false },
  });

  console.log("Database connection test (pg driver, SSL relaxed)\n");

  try {
    await client.connect();
    const res = await client.query("SELECT 1 AS ok");
    console.log("Query SELECT 1:", res.rows);
    if (res.rows[0]?.ok === 1) {
      console.log("Connection OK.");
    }

    const tables = await client.query(
      "SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename LIMIT 20"
    );
    console.log("\nTables in public schema:", tables.rows.length);
    tables.rows.forEach((r) => console.log("  -", r.tablename));
    console.log("\nDatabase connection test passed.");
  } catch (e) {
    console.error("\nDatabase connection failed:", e.message);
    process.exit(1);
  } finally {
    await client.end();
  }
}

main();
