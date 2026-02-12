/**
 * Test database connection. Run: node scripts/test-db-connection.js
 */
require("dotenv").config();
const { PrismaClient } = require("@prisma/client");

async function main() {
  const dbUrl = process.env.DATABASE_URL;
  const directUrl = process.env.DIRECT_URL;

  console.log("Database connection test\n");
  console.log("DATABASE_URL set:", !!dbUrl);
  console.log("DIRECT_URL set:", !!directUrl);
  if (!dbUrl) {
    console.error("Missing DATABASE_URL in .env");
    process.exit(1);
  }

  const prisma = new PrismaClient({ log: ["error"] });

  try {
    const result = await prisma.$queryRaw`SELECT 1 as ok`;
    console.log("Query SELECT 1:", result);
    if (result?.[0]?.ok === 1) {
      console.log("Connection OK (DATABASE_URL).");
    }

    const tables = await prisma.$queryRawUnsafe(
      "SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename LIMIT 20"
    );
    console.log("\nTables in public schema:", tables.length);
    tables.forEach((t) => console.log("  -", t.tablename));

    console.log("\nDatabase connection test passed.");
  } catch (e) {
    const msg = e.message || String(e);
    console.error("\nDatabase connection failed:", msg);
    if (msg.includes("security package") || msg.includes("EPERM") || msg.includes("TLS")) {
      console.error("\nNote: On Windows, TLS errors are common. Try:");
      console.error("  1. Run this script from WSL: wsl -d Ubuntu -e bash -c 'cd /mnt/e/Artha-Network/actions-server && node scripts/test-db-connection.js'");
      console.error("  2. Verify in Supabase Dashboard: Project Settings -> Database -> Connection string.");
      console.error("  3. Start the app with 'npm run dev' - the server may still connect when running.");
    }
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
