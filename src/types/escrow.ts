// Shared server-side escrow types. No HTTP framework imports here.

export type DealId = string;

export interface InitiateEscrowInput {
  title: string;
  amount: number; // token units (e.g., 1.25 USDC)
  currency: "USDC";
  counterpartyAddress: string; // base58
  feeBps: number; // 0..10000
  dueDateUnix: number | null;
  description?: string;
}

export interface InitiateEscrowResult {
  dealId: DealId;
  status: "INITIATED";
}

export interface FundEscrowInput {
  dealId: DealId;
  payer: string; // wallet base58
  amount: number;
}

export interface TransactionPayload {
  transactionBase64: string; // base64-encoded serialized transaction
  recentBlockhash: string;
  feePayer: string | null; // fee-payer pubkey if gas-sponsored
  simulation: {
    unitsConsumed: number;
    logs: string[];
  };
}

export interface FundEscrowResult extends TransactionPayload {
  kind: "FUND";
  dealId: DealId;
}

export interface ReleaseEscrowInput {
  dealId: DealId;
}

export interface ReleaseEscrowResult extends TransactionPayload {
  kind: "RELEASE";
  dealId: DealId;
}

export interface DisputeEscrowInput {
  dealId: DealId;
  reason?: string;
}

export interface DisputeEscrowResult {
  ok: true;
  dealId: DealId;
  disputeId: string;
}

