import type {
  InitiateActionInput,
  FundActionInput,
  ReleaseActionInput,
  RefundActionInput,
  OpenDisputeActionInput,
  ResolveActionInput,
  ConfirmActionInput,
  ActionResponse,
} from "../types/actions";
import { DealStatus } from "@prisma/client";
import { PublicKey, TransactionInstruction } from "@solana/web3.js";
import { solanaConfig } from "../config/solana";
import { getEscrowPda } from "../utils/deal";
import { logAction } from "../utils/logger";
import { prisma } from "../lib/prisma";
import { handleInitiate } from "./escrow/handlers/initiate.handler";
import { handleFund } from "./escrow/handlers/fund.handler";
import { handleRelease } from "./escrow/handlers/release.handler";
import { handleRefund } from "./escrow/handlers/refund.handler";
import { handleConfirm } from "./escrow/handlers/confirm.handler";
import type { ServiceOptions } from "./escrow/types";
import { resolveReqId, derivePayer, fetchDealSummary } from "./escrow/utils";
import { OPEN_DISPUTE_DISCRIMINATOR, RESOLVE_DISCRIMINATOR } from "./escrow/constants";

const VERDICT_RELEASE = 1;
const VERDICT_REFUND = 2;

export class EscrowService {
  async initiate(input: InitiateActionInput, options?: ServiceOptions): Promise<ActionResponse> {
    return handleInitiate(input, options);
  }

  async fund(input: FundActionInput, options?: ServiceOptions): Promise<ActionResponse> {
    return handleFund(input, options);
  }

  async release(input: ReleaseActionInput, options?: ServiceOptions): Promise<ActionResponse> {
    return handleRelease(input, options);
  }

  async openDispute(input: OpenDisputeActionInput, options?: ServiceOptions): Promise<ActionResponse> {
    const reqId = resolveReqId(options);
    const startedAt = Date.now();

    const deal = await fetchDealSummary(input.dealId);
    if (!deal) throw new Error("Deal not found");

    if (deal.status !== DealStatus.FUNDED) {
      throw new Error(`Deal must be FUNDED to open dispute, current status: ${deal.status}`);
    }

    // Validate caller is either buyer or seller
    if (deal.buyerWallet !== input.callerWallet && deal.sellerWallet !== input.callerWallet) {
      throw new Error("Only buyer or seller can open a dispute");
    }

    if (!deal.sellerWallet || !deal.buyerWallet) {
      throw new Error("Deal is missing buyer or seller wallet");
    }

    const callerPubkey = new PublicKey(input.callerWallet);

    // Get escrow PDA
    const actualDealId = deal.id;
    const { publicKey: escrowPda } = getEscrowPda({
      dealId: actualDealId,
    });

    // OpenDispute instruction only needs discriminator (no additional data)
    const data = OPEN_DISPUTE_DISCRIMINATOR;

    // OpenDispute struct account order (from on-chain):
    // 1. caller (signer, not writable)
    // 2. escrow_state (PDA, writable)
    const programIx = new TransactionInstruction({
      programId: solanaConfig.programId,
      keys: [
        { pubkey: callerPubkey, isSigner: true, isWritable: false },
        { pubkey: escrowPda, isSigner: false, isWritable: true },
      ],
      data,
    });

    const payerKey = derivePayer(callerPubkey);
    const txResult = await buildVersionedTransaction([programIx], payerKey);

    logAction({
      reqId,
      action: "actions.openDispute",
      dealId: deal.id,
      wallet: input.callerWallet,
      durationMs: Date.now() - startedAt,
      status: deal.status,
    });

    return {
      dealId: deal.id,
      txMessageBase64: txResult.txMessageBase64,
      nextClientAction: "confirm",
      latestBlockhash: txResult.latestBlockhash,
      lastValidBlockHeight: txResult.lastValidBlockHeight,
      feePayer: payerKey.toBase58(),
    };
  }

  async refund(input: RefundActionInput, options?: ServiceOptions): Promise<ActionResponse> {
    return handleRefund(input, options);
  }

  async resolve(input: ResolveActionInput, options?: ServiceOptions): Promise<ActionResponse> {
    const reqId = resolveReqId(options);
    const startedAt = Date.now();

    const deal = await fetchDealSummary(input.dealId);
    if (!deal) throw new Error("Deal not found");

    if (deal.status !== DealStatus.RESOLVED) {
      throw new Error(`Deal must be RESOLVED to execute resolution, current status: ${deal.status}`);
    }

    // Fetch the resolve ticket from the database
    const ticket = await prisma.resolveTicket.findFirst({
      where: { dealId: input.dealId },
      orderBy: { issuedAt: "desc" },
    });

    if (!ticket) {
      throw new Error("No resolution ticket found for this deal");
    }

    // Validate arbiter wallet matches
    if (ticket.arbiterPubkey !== input.arbiterWallet) {
      throw new Error("Arbiter wallet does not match the ticket");
    }

    // Map TicketAction to verdict value
    let verdict: number;
    if (ticket.finalAction === "RELEASE") {
      verdict = VERDICT_RELEASE;
    } else if (ticket.finalAction === "REFUND") {
      verdict = VERDICT_REFUND;
    } else {
      throw new Error(`Unsupported ticket action: ${ticket.finalAction}. SPLIT is not supported in current on-chain program.`);
    }

    const arbiterPubkey = new PublicKey(input.arbiterWallet);

    // Get escrow PDA
    const actualDealId = deal.id;
    const { publicKey: escrowPda } = getEscrowPda({
      dealId: actualDealId,
    });

    // Resolve instruction: discriminator + verdict (u8)
    const data = Buffer.concat([RESOLVE_DISCRIMINATOR, Buffer.from([verdict])]);

    // Resolve struct account order (from on-chain):
    // 1. arbiter (signer, not writable)
    // 2. escrow_state (PDA, writable)
    const programIx = new TransactionInstruction({
      programId: solanaConfig.programId,
      keys: [
        { pubkey: arbiterPubkey, isSigner: true, isWritable: false },
        { pubkey: escrowPda, isSigner: false, isWritable: true },
      ],
      data,
    });

    const payerKey = derivePayer(arbiterPubkey);
    const txResult = await buildVersionedTransaction([programIx], payerKey);

    logAction({
      reqId,
      action: "actions.resolve",
      dealId: deal.id,
      wallet: input.arbiterWallet,
      durationMs: Date.now() - startedAt,
      status: deal.status,
    });

    return {
      dealId: deal.id,
      txMessageBase64: txResult.txMessageBase64,
      nextClientAction: "confirm",
      latestBlockhash: txResult.latestBlockhash,
      lastValidBlockHeight: txResult.lastValidBlockHeight,
      feePayer: payerKey.toBase58(),
    };
  }

  async confirm(input: ConfirmActionInput, options?: ServiceOptions) {
    return handleConfirm(input, options);
  }
}

export const escrowService = new EscrowService();
