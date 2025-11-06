/**
 * @module SupabaseAdmin
 * @description Creates and exports a Supabase admin client using the service role key.
 */
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.SUPABASE_URL ?? "https://xwsinvputbgrifvxjehf.supabase.co";
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE ?? process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SERVICE_ROLE) {
  throw new Error("Missing SUPABASE_SERVICE_ROLE environment variable");
}

export const supabaseAdmin = createClient(SUPABASE_URL, SERVICE_ROLE);

export default supabaseAdmin;
