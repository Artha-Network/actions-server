import { randomUUID } from "crypto";
import { PublicKey } from "@solana/web3.js";
import { solanaConfig, FEE_PAYER } from "../../config/solana";
import { prisma } from "../../lib/prisma";
import type { DealSummary, ServiceOptions } from "./types";

export function resolveReqId(options?: ServiceOptions): string {
  return options?.reqId ?? randomUUID();
}

export function secondsFromUnix(timestamp?: number): number {
  if (typeof timestamp === "number" && Number.isFinite(timestamp)) return timestamp;
  return Math.floor(Date.now() / 1000);
}

export function ensureDeadline(unixTs?: number, fallbackDays = 3): number {
  if (unixTs && unixTs > 0) return unixTs;
  return secondsFromUnix() + fallbackDays * 24 * 60 * 60;
}

export function derivePayer(candidate?: PublicKey, fallback?: PublicKey): PublicKey {
  if (solanaConfig.sponsoredFees && FEE_PAYER) {
    return FEE_PAYER;
  }
  if (candidate) return candidate;
  if (fallback) return fallback;
  throw new Error("Unable to determine transaction fee payer");
}

export async function fetchDealSummary(id: string): Promise<DealSummary | null> {
  return prisma.deal.findUnique({
    where: { id },
    select: {
      id: true,
      status: true,
      buyerWallet: true,
      sellerWallet: true,
      arbiterPubkey: true,
      priceUsd: true,
      depositTokenMint: true,
      vaultAta: true,
      onchainAddress: true,
      deliverDeadline: true,
      disputeDeadline: true,
      createdAt: true,
      updatedAt: true,
      fundedAt: true,
    },
  });
}


