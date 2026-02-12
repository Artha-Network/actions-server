import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
    console.log("Verifying sessions table...");

    try {
        // Check if sessions table exists by trying to query it
        const result = await prisma.$queryRawUnsafe<Array<{ count: bigint }>>(
            `SELECT COUNT(*) as count FROM sessions;`
        );
        
        console.log(`✅ Sessions table exists with ${result[0].count} records`);

        // Check table structure (only in public schema to avoid Supabase auth.sessions)
        const columns = await prisma.$queryRawUnsafe<Array<{
            column_name: string;
            data_type: string;
            table_schema: string;
        }>>(`
            SELECT column_name, data_type, table_schema
            FROM information_schema.columns 
            WHERE table_name = 'sessions' 
            AND table_schema = 'public'
            ORDER BY ordinal_position;
        `);

        console.log("\n📋 Sessions table structure:");
        columns.forEach(col => {
            console.log(`  - ${col.column_name}: ${col.data_type}`);
        });

        // Check indexes
        const indexes = await prisma.$queryRawUnsafe<Array<{ indexname: string }>>(`
            SELECT indexname 
            FROM pg_indexes 
            WHERE tablename = 'sessions';
        `);

        console.log("\n🔍 Indexes on sessions table:");
        indexes.forEach(idx => {
            console.log(`  - ${idx.indexname}`);
        });

        console.log("\n✅ Sessions table verification complete!");

    } catch (error: any) {
        if (error.message?.includes("does not exist")) {
            console.error("❌ Sessions table does not exist!");
        } else {
            console.error("❌ Error verifying sessions table:", error.message);
        }
        process.exit(1);
    } finally {
        await prisma.$disconnect();
    }
}

main();

