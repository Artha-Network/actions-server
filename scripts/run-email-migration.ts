import { PrismaClient } from "@prisma/client";
import * as fs from "fs";
import * as path from "path";

const prisma = new PrismaClient();

async function main() {
  console.log("Running email fields migration...");
  
  // First, determine which schema the deals table is in
  let schemaName = "public";
  try {
    const result = await prisma.$queryRawUnsafe<Array<{ table_schema: string }>>(`
      SELECT table_schema 
      FROM information_schema.tables 
      WHERE table_name = 'deals' 
      LIMIT 1;
    `);
    if (result && result.length > 0) {
      schemaName = result[0].table_schema;
      console.log(`Found deals table in schema: ${schemaName}`);
    }
  } catch (error: any) {
    console.log("Could not determine schema, defaulting to 'public'");
  }
  
  // Execute statements one by one, in order
  // First: Add columns
  console.log(`Adding buyer_email column to ${schemaName}.deals...`);
  try {
    await prisma.$executeRawUnsafe(`
      ALTER TABLE ${schemaName}.deals 
      ADD COLUMN IF NOT EXISTS buyer_email TEXT;
    `);
    console.log("✅ buyer_email column added");
  } catch (error: any) {
    if (error.message?.includes("already exists") || error.message?.includes("duplicate")) {
      console.log("⚠️  buyer_email already exists, skipping...");
    } else {
      console.error("❌ Error adding buyer_email:", error.message);
      throw error;
    }
  }
  
  console.log(`Adding seller_email column to ${schemaName}.deals...`);
  try {
    await prisma.$executeRawUnsafe(`
      ALTER TABLE ${schemaName}.deals 
      ADD COLUMN IF NOT EXISTS seller_email TEXT;
    `);
    console.log("✅ seller_email column added");
  } catch (error: any) {
    if (error.message?.includes("already exists") || error.message?.includes("duplicate")) {
      console.log("⚠️  seller_email already exists, skipping...");
    } else {
      console.error("❌ Error adding seller_email:", error.message);
      throw error;
    }
  }
  
  // Then: Create indexes (only after columns exist)
  console.log("Creating indexes...");
  try {
    await prisma.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS deals_buyer_email_idx ON ${schemaName}.deals(buyer_email) WHERE buyer_email IS NOT NULL;
    `);
    console.log("✅ buyer_email index created");
  } catch (error: any) {
    if (error.message?.includes("already exists") || error.message?.includes("duplicate")) {
      console.log("⚠️  buyer_email index already exists, skipping...");
    } else {
      console.error("❌ Error creating buyer_email index:", error.message);
      // Don't throw - indexes are optional
    }
  }
  
  try {
    await prisma.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS deals_seller_email_idx ON ${schemaName}.deals(seller_email) WHERE seller_email IS NOT NULL;
    `);
    console.log("✅ seller_email index created");
  } catch (error: any) {
    if (error.message?.includes("already exists") || error.message?.includes("duplicate")) {
      console.log("⚠️  seller_email index already exists, skipping...");
    } else {
      console.error("❌ Error creating seller_email index:", error.message);
      // Don't throw - indexes are optional
    }
  }
  
  console.log("✅ Migration completed successfully!");
}

main()
  .catch((e) => {
    console.error("Migration failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

