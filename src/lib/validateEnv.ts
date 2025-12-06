
import { solanaConfig } from "../config/solana";

export function validateEnv() {
    console.log("--- Environment Validation ---");

    const databaseUrl = process.env.DATABASE_URL;
    const cluster = solanaConfig.cluster;

    if (!databaseUrl) {
        throw new Error("Missing DATABASE_URL environment variable");
    }

    const isLocalDb = databaseUrl.includes("localhost") || databaseUrl.includes("127.0.0.1");

    console.log(`Cluster: ${cluster}`);
    console.log(`Database URL: ${isLocalDb ? "Local (Forbidden)" : "Remote"}`);

    // STRICT RULE: No local database connections allowed to prevent drift/confusion.
    if (isLocalDb) {
        console.error("❌ CRITICAL CONFIGURATION ERROR ❌");
        console.error("Local database connections are explicitly forbidden to prevent configuration drift.");
        console.error("You must connect to the shared Supabase instance (or remote Postgres).");
        console.error("Please update DATABASE_URL in .env to point to the Supabase Transaction Pooler URL.");
        process.exit(1);
    }

    if (!process.env.SUPABASE_URL) {
        console.error("Missing SUPABASE_URL");
        process.exit(1);
    }
    if (!process.env.SUPABASE_SERVICE_ROLE && !process.env.SUPABASE_SERVICE_ROLE_KEY) {
        console.error("Missing SUPABASE_SERVICE_ROLE");
        process.exit(1);
    }

    console.log("✅ Environment configuration looks correct.");
    console.log("------------------------------");
}
