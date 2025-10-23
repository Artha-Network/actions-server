/**
 * @module SupabaseUserService
 * @description User CRUD helpers using Supabase admin client.
 */
import { supabaseAdmin } from "../lib/supabaseAdmin";

export const createUserIfMissing = async (walletAddress: string) => {
  const { data, error } = await supabaseAdmin
    .from("users")
    .upsert({ wallet_address: walletAddress })
    .select();
  if (error) throw new Error(error.message);
  return data;
};

