/**
 * Test database connection using Prisma and env DATABASE_URL / DIRECT_URL.
 * Run: npx tsx scripts/test-db-connection.ts
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";

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

  const prisma = new PrismaClient({
    log: ["error"],
  });

  try {
    // Simple query to verify connection
    const result = await prisma.$queryRaw<[{ ok: number }]>`SELECT 1 as ok`;
    console.log("\nQuery SELECT 1:", result);
    if (result?.[0]?.ok === 1) {
      console.log("Connection OK (pooled/DATABASE_URL).");
    }

    // Optional: test direct connection if different
    if (directUrl && directUrl !== dbUrl) {
      const direct = new PrismaClient({
        datasources: { db: { url: directUrl } },
        log: ["error"],
      });
      const directResult = await direct.$queryRaw<[{ ok: number }]>`SELECT 1 as ok`;
      console.log("Direct connection OK (DIRECT_URL).");
      await direct.$disconnect();
    }

    // List tables we care about (public / schema)
    const tables = await prisma.$queryRaw<
      { tablename: string }[]
    >`SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename`;
    console.log("\nTables in public schema:", tables.length);
    tables.slice(0, 15).forEach((t) => console.log("  -", t.tablename));
    if (tables.length > 15) console.log("  ... and", tables.length - 15, "more");

    console.log("\nDatabase connection test passed.");
  } catch (e) {
    console.error("\nDatabase connection failed:", e);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
