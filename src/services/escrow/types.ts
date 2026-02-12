import { Prisma, DealStatus } from "@prisma/client";

export interface ServiceOptions {
  reqId?: string;
}

export interface DealSummary {
  id: string;
  status: DealStatus;
  buyerWallet: string | null;
  sellerWallet: string | null;
  arbiterPubkey: string;
  priceUsd: Prisma.Decimal;
  depositTokenMint: string;
  vaultAta: string;
  onchainAddress: string;
  deliverDeadline: Date;
  disputeDeadline: Date;
  createdAt: Date;
  updatedAt: Date;
  fundedAt: Date | null;
}


