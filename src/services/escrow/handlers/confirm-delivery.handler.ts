import { DealStatus, TicketSource } from "@prisma/client";
import type { ConfirmDeliveryInput } from "../../../types/actions";
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
 * Buyer confirms delivery — server-side resolve with VERDICT_RELEASE.
 * The deal moves to RESOLVED so the seller can claim funds from the Resolution page.
 */
export async function handleConfirmDelivery(
  input: ConfirmDeliveryInput,
  options?: { reqId?: string }
) {
  const reqId = resolveReqId(options);
  const startedAt = Date.now();

  const deal = await fetchDealSummary(input.dealId);
  if (!deal) throw new Error("Deal not found");

  if (deal.status !== DealStatus.FUNDED) {
    throw new Error(`Deal must be FUNDED to confirm delivery, current status: ${deal.status}`);
  }

  if (deal.buyerWallet !== input.buyerWallet) {
    throw new Error("Only the buyer can confirm delivery");
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

  // Build resolve instruction with VERDICT_RELEASE and send server-side
  const { ix: resolveIx, arbiterKeypair } = escrowService.buildResolveIx(deal.id, "RELEASE");
  const txResult = await buildSignAndSendTransaction([resolveIx], arbiterKeypair);

  // Create ResolveTicket with acceptedAt pre-set (no contest window for voluntary confirmation)
  await prisma.$transaction(async (tx) => {
    await tx.resolveTicket.create({
      data: {
        dealId: deal.id,
        finalAction: "RELEASE",
        confidence: 1.0,
        rationaleCid: "Buyer confirmed delivery",
        arbiterPubkey: arbiterKeypair.publicKey.toBase58(),
        signature: txResult.txSig,
        source: TicketSource.BUYER_CONFIRMED,
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
    action: "actions.confirmDelivery",
    dealId: deal.id,
    wallet: input.buyerWallet,
    durationMs: Date.now() - startedAt,
    status: "RESOLVED",
  });

  // Fire-and-forget notifications
  if (deal.sellerWallet) {
    createNotificationByWallet(deal.sellerWallet, "Delivery confirmed", {
      body: "The buyer confirmed delivery. Visit the Resolution page to claim your funds.",
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
      actorRole: "buyer",
    }).catch(console.error);
  }

  return { dealId: deal.id, status: "RESOLVED", verdict: "RELEASE" };
}
