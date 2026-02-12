import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
    console.log("Running migration: Create auth_challenges table...");

    try {
        // Create table - wallet_address is the primary key (matches Prisma schema)
        await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS auth_challenges (
        wallet_address TEXT PRIMARY KEY,
        challenge TEXT NOT NULL,
        expires_at TIMESTAMP NOT NULL
      );
    `);
        console.log("✅ auth_challenges table created (or exists)");

        // Create index
        await prisma.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS auth_challenges_wallet_idx ON auth_challenges(wallet_address);
    `);
        console.log("✅ Index created");

    } catch (error: any) {
        console.error("❌ Migration failed:", error);
        process.exit(1);
    } finally {
        await prisma.$disconnect();
    }
}

main();
