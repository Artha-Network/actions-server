import { z } from "zod";

const EnvSchema = z.object({
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  SUPABASE_URL: z.string().url("SUPABASE_URL must be a valid URL"),
  // Accept either key name
  SUPABASE_SERVICE_ROLE: z.string().min(1).optional(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1).optional(),
}).refine(
  (env) => env.SUPABASE_SERVICE_ROLE || env.SUPABASE_SERVICE_ROLE_KEY,
  { message: "Either SUPABASE_SERVICE_ROLE or SUPABASE_SERVICE_ROLE_KEY is required" }
);

export function validateEnv() {
  const result = EnvSchema.safeParse(process.env);

  if (!result.success) {
    const missing = result.error.issues.map((i) => `  - ${i.path.join(".")}: ${i.message}`).join("\n");
    console.error(`[actions-server] Environment validation failed:\n${missing}`);
    process.exit(1);
  }

  const databaseUrl = process.env.DATABASE_URL!;
  const isLocalDb = databaseUrl.includes("localhost") || databaseUrl.includes("127.0.0.1");

  if (isLocalDb) {
    console.error("[actions-server] Local database connections are forbidden. Use the Supabase Pooler URL.");
    process.exit(1);
  }

  console.log("[actions-server] Environment validation passed.");
}
