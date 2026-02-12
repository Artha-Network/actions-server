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
import { PublicKey, TransactionInstruction, Keypair } from "@solana/web3.js";
import { solanaConfig } from "../config/solana";
import { buildVersionedTransaction, buildSignAndSendTransaction } from "../solana/transaction";
import { getEscrowPda, getEscrowPdaSeedsScheme, getEscrowPdaWithParties } from "../utils/deal";
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

    // Get escrow PDA (same scheme as initiate: deal_id or parties)
    const actualDealId = deal.id;
    const pdaScheme = getEscrowPdaSeedsScheme();
    const { publicKey: escrowPda } =
      pdaScheme === "parties" && deal.sellerWallet && deal.buyerWallet && deal.depositTokenMint
        ? getEscrowPdaWithParties(deal.sellerWallet, deal.buyerWallet, deal.depositTokenMint)
        : getEscrowPda({ dealId: actualDealId });

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

  async resolve(input: ResolveActionInput, options?: ServiceOptions): Promise<ActionResponse & { txSig?: string }> {
    const reqId = resolveReqId(options);
    const startedAt = Date.now();

    const hex = process.env.ARBITER_ED25519_SECRET_HEX;
    if (!hex || typeof hex !== "string") {
      throw new Error("ARBITER_ED25519_SECRET_HEX is not set");
    }
    const secretBytes = Buffer.from(hex.replace(/^0x/i, ""), "hex");
    const arbiterKeypair =
      secretBytes.length === 64
        ? Keypair.fromSecretKey(new Uint8Array(secretBytes))
        : secretBytes.length === 32
          ? Keypair.fromSeed(new Uint8Array(secretBytes))
          : (() => {
              throw new Error("ARBITER_ED25519_SECRET_HEX must be 32 or 64 bytes (hex)");
            })();

    const deal = await fetchDealSummary(input.dealId);
    if (!deal) throw new Error("Deal not found");

    if (deal.status !== DealStatus.RESOLVED && deal.status !== DealStatus.DISPUTED) {
      throw new Error(`Deal must have a resolution (RESOLVED or DISPUTED with ticket) to execute resolve, current: ${deal.status}`);
    }

    let verdictU8: number;
    if (input.verdict) {
      verdictU8 = input.verdict === "RELEASE" ? 1 : 2;
    } else {
      const ticket = await prisma.resolveTicket.findFirst({
        where: { dealId: input.dealId },
        orderBy: { issuedAt: "desc" },
      });
      if (!ticket) throw new Error("No resolution ticket found; call arbitrate first or pass verdict");
      verdictU8 = ticket.finalAction === "RELEASE" ? 1 : 2;
    }

    const pdaScheme = getEscrowPdaSeedsScheme();
    const { publicKey: escrowPda } =
      pdaScheme === "parties" && deal.sellerWallet && deal.buyerWallet && deal.depositTokenMint
        ? getEscrowPdaWithParties(deal.sellerWallet, deal.buyerWallet, deal.depositTokenMint)
        : getEscrowPda({ dealId: deal.id });

    const data = Buffer.concat([RESOLVE_DISCRIMINATOR, Buffer.from([verdictU8])]);
    const programIx = new TransactionInstruction({
      programId: solanaConfig.programId,
      keys: [
        { pubkey: arbiterKeypair.publicKey, isSigner: true, isWritable: false },
        { pubkey: escrowPda, isSigner: false, isWritable: true },
      ],
      data,
    });

    const result = await buildSignAndSendTransaction([programIx], arbiterKeypair);

    logAction({
      reqId,
      action: "actions.resolve",
      dealId: input.dealId,
      durationMs: Date.now() - startedAt,
      status: deal.status,
    });

    return {
      dealId: input.dealId,
      txSig: result.txSig,
      nextClientAction: verdictU8 === 1 ? "release" : "refund",
      latestBlockhash: result.latestBlockhash,
      lastValidBlockHeight: result.lastValidBlockHeight,
    };
  }

  async confirm(input: ConfirmActionInput, options?: ServiceOptions) {
    return handleConfirm(input, options);
  }
}

export const escrowService = new EscrowService();
