import { createHash, randomUUID } from "crypto";
import { PublicKey } from "@solana/web3.js";
import { solanaConfig } from "../config/solana";

export function deriveDeterministicDealId(seed: Record<string, unknown>): string {
  const canonical = JSON.stringify(seed, Object.keys(seed).sort());
  const digest = createHash("sha256").update(canonical).digest("hex").slice(0, 32);
  const parts = [
    digest.slice(0, 8),
    digest.slice(8, 12),
    digest.slice(12, 16),
    digest.slice(16, 20),
    digest.slice(20, 32),
  ];
  return parts.join("-");
}

export function ensureDealId(proposed?: string | null, seed?: Record<string, unknown>) {
  if (proposed) return proposed;
  if (seed) return deriveDeterministicDealId(seed);
  return randomUUID();
}

export function dealIdToBytes(dealId: string): Buffer {
  const hex = dealId.replace(/-/g, "");
  if (hex.length !== 32) throw new Error("dealId must be 16 bytes");
  return Buffer.from(hex, "hex");
}

export function dealIdToBigInt(dealId: string): bigint {
  return BigInt(`0x${dealId.replace(/-/g, "")}`);
}

function toPublicKey(value: string | PublicKey): PublicKey {
  return value instanceof PublicKey ? value : new PublicKey(value);
}

interface EscrowSeedsInput {
  dealId: string; // UUID string - required for PDA seeds
}

/** Seeds scheme: "deal_id" (default) = [escrow, deal_id]; "parties" = [escrow, seller, buyer, mint] (legacy) */
export function getEscrowPdaSeedsScheme(): "deal_id" | "parties" {
  const v = process.env.ESCROW_PDA_SEEDS?.toLowerCase();
  return v === "parties" ? "parties" : "deal_id";
}

/**
 * Derives the EscrowState PDA using only deal_id (current program):
 * PDA seeds: ["escrow", deal_id_bytes]
 */
export function getEscrowPda({ dealId }: EscrowSeedsInput) {
  const dealIdBytes = dealIdToBytes(dealId);

  const seeds = [
    Buffer.from("escrow"),
    dealIdBytes, // deal_id as bytes (16 bytes)
  ];
  const [publicKey, bump] = PublicKey.findProgramAddressSync(seeds, solanaConfig.programId);
  return { publicKey, bump };
}

/**
 * Derives the EscrowState PDA using seller, buyer, mint (legacy program / initiate_handler.rs):
 * PDA seeds: ["escrow", seller, buyer, mint]
 */
export function getEscrowPdaWithParties(
  sellerWallet: string | PublicKey,
  buyerWallet: string | PublicKey,
  mint: string | PublicKey
) {
  const seller = toPublicKey(sellerWallet);
  const buyer = toPublicKey(buyerWallet);
  const mintKey = toPublicKey(mint);
  const seeds = [
    Buffer.from("escrow"),
    seller.toBuffer(),
    buyer.toBuffer(),
    mintKey.toBuffer(),
  ];
  const [publicKey, bump] = PublicKey.findProgramAddressSync(seeds, solanaConfig.programId);
  return { publicKey, bump };
}
