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

interface EscrowSeedsInput {
  dealId: string; // UUID string - required for PDA seeds
}

/**
 * Derives the EscrowState PDA from raw deal_id bytes (must match instruction data exactly).
 * PDA seeds: ["escrow", deal_id_bytes] — use the same Buffer for instruction data to avoid ConstraintSeeds 2006.
 */
export function getEscrowPdaFromBytes(dealIdBytes: Buffer) {
  if (dealIdBytes.length !== 16) {
    throw new Error(`dealIdBytes must be 16 bytes, got ${dealIdBytes.length}`);
  }
  const seeds = [Buffer.from("escrow"), dealIdBytes];
  const [publicKey, bump] = PublicKey.findProgramAddressSync(seeds, solanaConfig.programId);
  return { publicKey, bump };
}

/**
 * Derives the EscrowState PDA using deal_id (matches on-chain program lib.rs):
 * PDA seeds: ["escrow", deal_id_bytes]
 */
export function getEscrowPda({ dealId }: EscrowSeedsInput) {
  const dealIdBytes = dealIdToBytes(dealId);
  return getEscrowPdaFromBytes(dealIdBytes);
}

