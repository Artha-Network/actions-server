import type {
  InitiateEscrowInput,
  InitiateEscrowResult,
  FundEscrowInput,
  FundEscrowResult,
  ReleaseEscrowInput,
  ReleaseEscrowResult,
  DisputeEscrowInput,
  DisputeEscrowResult,
} from "../types/escrow";
import { isBase58Address, isValidBps } from "../utils/validation";

/**
 * EscrowService contains business operations for building Actions/Blinks payloads.
 * This module has no HTTP concerns. Replace placeholders with actual integrations
 * to onchain-escrow (IDL) and tickets-lib when wiring real logic.
 */
export class EscrowService {
  async initiate(input: InitiateEscrowInput): Promise<InitiateEscrowResult> {
    if (!isBase58Address(input.counterpartyAddress)) throw new Error("invalid counterparty address");
    if (!isValidBps(input.feeBps)) throw new Error("invalid fee bps");
    if (!(input.amount > 0)) throw new Error("invalid amount");

    // TODO: build a transaction (blink) using solana-kit + onchain-escrow IDL
    // For now, return a deterministic mock ID for UI flows.
    const dealId = `DEAL-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
    return { dealId, status: "INITIATED" };
  }

  async fund(input: FundEscrowInput): Promise<FundEscrowResult>{
    if (!input?.dealId) throw new Error("dealId required");
    if (!isBase58Address(input.payer)) throw new Error("invalid payer address");
    if (!(input.amount > 0)) throw new Error("invalid amount");

    // Placeholder transaction payload
    const tx: FundEscrowResult = {
      kind: "FUND",
      dealId: input.dealId,
      transactionBase64: "AQID-BASE64-TX",
      recentBlockhash: "DummyBlockhash111111111111111111111111111",
      feePayer: null,
      simulation: {
        unitsConsumed: 10000,
        logs: ["Program log: simulate fund"],
      },
    };
    return tx;
  }

  async release(input: ReleaseEscrowInput): Promise<ReleaseEscrowResult>{
    if (!input?.dealId) throw new Error("dealId required");

    const tx: ReleaseEscrowResult = {
      kind: "RELEASE",
      dealId: input.dealId,
      transactionBase64: "AQID-BASE64-TX",
      recentBlockhash: "DummyBlockhash111111111111111111111111111",
      feePayer: null,
      simulation: {
        unitsConsumed: 8000,
        logs: ["Program log: simulate release"],
      },
    };
    return tx;
  }

  async dispute(input: DisputeEscrowInput): Promise<DisputeEscrowResult>{
    if (!input?.dealId) throw new Error("dealId required");
    const disputeId = `DSP-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
    return { ok: true, dealId: input.dealId, disputeId };
  }
}

export const escrowService = new EscrowService();

