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
  seller: string | PublicKey;
  buyer: string | PublicKey;
  mint: string | PublicKey;
}

export function getEscrowPda({ seller, buyer, mint }: EscrowSeedsInput) {
  const sellerPk = toPublicKey(seller);
  const buyerPk = toPublicKey(buyer);
  const mintPk = toPublicKey(mint);

  const seeds = [
    Buffer.from("escrow"),
    sellerPk.toBuffer(),
    buyerPk.toBuffer(),
    mintPk.toBuffer(),
  ];
  const [publicKey, bump] = PublicKey.findProgramAddressSync(seeds, solanaConfig.programId);
  return { publicKey, bump };
}
