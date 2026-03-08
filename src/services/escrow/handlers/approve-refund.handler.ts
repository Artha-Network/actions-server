import { DealStatus, TicketSource } from "@prisma/client";
import type { ApproveRefundInput } from "../../../types/actions";
import { solanaConfig, rpcManager } from "../../../config/solana";
import { getEscrowPda } from "../../../utils/deal";
import { logAction } from "../../../utils/logger";
import { withRpcRetry } from "../../../utils/rpc-retry";
import { resolveReqId, fetchDealSummary } from "../utils";
import { escrowService } from "../../escrow-service";
import { buildSignAndSendTransaction } from "../../../solana/transaction";
import { prisma } from "../../../lib/prisma";
import { sendDealStatusNotification } from "../../email.service";
import { createNotificationByWallet } from "../../notification.service";

const ESCROW_STATUS_OFFSET = 8 + 1 + 32 + 32 + 32 + 32 + 32 + 8 + 2 + 8; // 187

/**
 * Seller voluntarily approves a refund — server-side resolve with VERDICT_REFUND.
 * The deal moves to RESOLVED so the buyer can claim their refund from the Resolution page.
 */
export async function handleApproveRefund(
  input: ApproveRefundInput,
  options?: { reqId?: string }
) {
  const reqId = resolveReqId(options);
  const startedAt = Date.now();

  const deal = await fetchDealSummary(input.dealId);
  if (!deal) throw new Error("Deal not found");

  if (deal.status !== DealStatus.FUNDED) {
    throw new Error(`Deal must be FUNDED to approve refund, current status: ${deal.status}`);
  }

  if (deal.sellerWallet !== input.sellerWallet) {
    throw new Error("Only the seller can approve a refund");
  }

  // Check on-chain status
  const { publicKey: escrowPda } = getEscrowPda({ dealId: deal.id });
  const escrowAccountInfo = await withRpcRetry(
    async (conn) => conn.getAccountInfo(escrowPda),
    { endpointManager: rpcManager, timeoutMs: 3000, maxAttempts: 2 }
  );
  if (!escrowAccountInfo) {
    throw new Error(`Escrow account not found on-chain. PDA: ${escrowPda.toBase58()}`);
  }
  const onChainStatus = escrowAccountInfo.data[ESCROW_STATUS_OFFSET];
  if (onChainStatus !== 1 /* Funded */) {
    const STATUS_NAMES = ["Init", "Funded", "Disputed", "Resolved", "Released", "Refunded"];
    throw new Error(`On-chain escrow is "${STATUS_NAMES[onChainStatus] ?? "Unknown"}" — expected Funded`);
  }

  // Build resolve instruction with VERDICT_REFUND and send server-side
  const { ix: resolveIx, arbiterKeypair } = escrowService.buildResolveIx(deal.id, "REFUND");
  const txResult = await buildSignAndSendTransaction([resolveIx], arbiterKeypair);

  // Create ResolveTicket with acceptedAt pre-set (no contest window for voluntary refund)
  await prisma.$transaction(async (tx) => {
    await tx.resolveTicket.create({
      data: {
        dealId: deal.id,
        finalAction: "REFUND",
        confidence: 1.0,
        rationaleCid: "Seller approved voluntary refund",
        arbiterPubkey: arbiterKeypair.publicKey.toBase58(),
        signature: txResult.txSig,
        source: TicketSource.SELLER_VOLUNTARY,
        acceptedAt: new Date(),
      },
    });

    await tx.onchainEvent.create({
      data: {
        dealId: deal.id,
        txSig: txResult.txSig,
        slot: BigInt(0),
        instruction: "RESOLVE",
        mint: solanaConfig.usdcMint.toBase58(),
        amount: null,
      },
    });

    await tx.deal.update({
      where: { id: deal.id },
      data: { status: DealStatus.RESOLVED, updatedAt: new Date() },
    });
  });

  logAction({
    reqId,
    action: "actions.approveRefund",
    dealId: deal.id,
    wallet: input.sellerWallet,
    durationMs: Date.now() - startedAt,
    status: "RESOLVED",
  });

  // Fire-and-forget notifications
  if (deal.buyerWallet) {
    createNotificationByWallet(deal.buyerWallet, "Refund approved", {
      body: "The seller approved a refund. Visit the Resolution page to claim your funds.",
      type: "deal",
      dealId: deal.id,
    });
  }

  // Reload deal for email data
  const updatedDeal = await prisma.deal.findUnique({
    where: { id: deal.id },
    select: { title: true, priceUsd: true, buyerEmail: true, sellerEmail: true },
  });
  if (updatedDeal) {
    sendDealStatusNotification({
      dealId: deal.id,
      dealTitle: updatedDeal.title,
      amountUsd: updatedDeal.priceUsd.toString(),
      buyerEmail: updatedDeal.buyerEmail,
      sellerEmail: updatedDeal.sellerEmail,
      newStatus: "RESOLVED" as any,
      actorRole: "seller",
    }).catch(console.error);
  }

  return { dealId: deal.id, status: "RESOLVED", verdict: "REFUND" };
}
