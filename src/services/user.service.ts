/**
 * User Service
 * User CRUD helpers using Supabase admin client.
 */
import { supabaseAdmin } from "../lib/supabaseAdmin";

export type WalletNetwork = "devnet" | "testnet" | "localnet";

export const createUserIfMissing = async (walletAddress: string) => {
  const { data, error } = await supabaseAdmin
    .from("users")
    .upsert({
      wallet_address: walletAddress,
      wallet_public_key: walletAddress,
      last_seen_at: new Date().toISOString()
    }, { onConflict: 'wallet_address' })
    .select()
    .single();

  if (error) throw new Error(error.message);
  return data;
};

export const upsertWalletIdentity = async (walletAddress: string, network: string) => {
  const { data, error } = await supabaseAdmin
    .from("users")
    .upsert({
      wallet_address: walletAddress,
      wallet_public_key: walletAddress,
      network: network === 'testnet' ? 'testnet' : 'devnet',
      last_seen_at: new Date().toISOString()
    }, { onConflict: 'wallet_address' })
    .select()
    .single();

  if (error) throw new Error(error.message);

  return {
    userId: data.id,
    walletAddress: data.wallet_address,
    network: data.network,
    lastSeenAt: new Date(data.last_seen_at),
  };
};
