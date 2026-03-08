import { AttestationKind, DealStatus } from "@prisma/client";
import type { ConfirmActionInput } from "../../../types/actions";
import { solanaConfig } from "../../../config/solana";
import { logAction } from "../../../utils/logger";
import { isBase58Address } from "../../../utils/validation";
import { rpcManager } from "../../../config/solana";
import { prisma } from "../../../lib/prisma";
import { withRpcRetry } from "../../../utils/rpc-retry";
import { resolveReqId } from "../utils";
import { sendDealStatusNotification } from "../../email.service";
import { createNotificationByWallet } from "../../notification.service";

export async function handleConfirm(
  input: ConfirmActionInput,
  options?: { reqId?: string }
) {
  const reqId = resolveReqId(options);
  const startedAt = Date.now();

  if (!isBase58Address(input.actorWallet)) {
    throw new Error("Invalid actor wallet");
  }

  // Mock signatures are only allowed in non-production environments
  const isMockSignature = input.txSig.startsWith("11111111111111111111111111111111");
  if (isMockSignature && process.env.NODE_ENV === "production") {
    throw new Error("Mock signatures are not allowed in production");
  }

  let slot = 0;
  if (!isMockSignature) {
    const statusResp = await withRpcRetry(
      async (conn) => conn.getSignatureStatuses([input.txSig], { searchTransactionHistory: true }),
      { endpointManager: rpcManager }
    );
    const signatureStatus = statusResp.value[0];
    if (!signatureStatus) throw new Error("Transaction not found");
    if (signatureStatus.err) throw new Error("Transaction failed");
    slot = signatureStatus.slot ?? 0;
  } else {
    // For mock signatures, use a placeholder slot
    // eslint-disable-next-line no-console
    console.warn(
      `[confirm] Mock signature detected for deal ${input.dealId}, skipping blockchain verification`
    );
    slot = 0;
  }

  let deal_previousStatus!: DealStatus;
  const result = await prisma.$transaction(async (tx) => {
    const deal = await tx.deal.findUnique({ where: { id: input.dealId } });
    if (!deal) throw new Error("Deal not found");
    deal_previousStatus = deal.status;

    // Validate actor wallet matches expected role
    let expectedWallet: string | null;
    if (input.action === "FUND" || input.action === "RELEASE") {
      expectedWallet = deal.buyerWallet;
    } else if (input.action === "REFUND") {
      expectedWallet = deal.sellerWallet;
    } else if (input.action === "OPEN_DISPUTE") {
      // For dispute, either buyer or seller can be the actor
      if (input.actorWallet !== deal.buyerWallet && input.actorWallet !== deal.sellerWallet) {
        throw new Error("Actor wallet must be buyer or seller");
      }
      expectedWallet = input.actorWallet;
    } else if (input.action === "RESOLVE") {
      // For resolve, actor must be the arbiter
      expectedWallet = deal.arbiterPubkey;
    } else {
      expectedWallet = deal.sellerWallet;
    }

    if (expectedWallet !== input.actorWallet) throw new Error("Actor wallet mismatch");

    let nextStatus: DealStatus;
    switch (input.action) {
      case "FUND":
        if (deal.status !== DealStatus.INIT) throw new Error("Invalid transition");
        nextStatus = DealStatus.FUNDED;
        break;
      case "RELEASE":
        if (!(deal.status === DealStatus.FUNDED || deal.status === DealStatus.RESOLVED))
          throw new Error("Invalid transition");
        nextStatus = DealStatus.RELEASED;
        break;
      case "REFUND":
        if (!(deal.status === DealStatus.FUNDED || deal.status === DealStatus.RESOLVED))
          throw new Error("Invalid transition");
        nextStatus = DealStatus.REFUNDED;
        break;
      case "OPEN_DISPUTE":
        if (deal.status !== DealStatus.FUNDED)
          throw new Error("Invalid transition: can only dispute FUNDED deals");
        nextStatus = DealStatus.DISPUTED;
        break;
      case "RESOLVE":
        if (deal.status !== DealStatus.DISPUTED && deal.status !== DealStatus.FUNDED) {
          throw new Error("Invalid transition: can only resolve DISPUTED or FUNDED deals");
        }
        // RESOLVE only records the arbiter's verdict on-chain — funds don't move yet.
        // The actual transfer happens when seller signs RELEASE (or buyer signs REFUND).
        nextStatus = DealStatus.RESOLVED;
        break;
      case "INITIATE":
      default:
        nextStatus = deal.status;
    }

    await tx.onchainEvent.create({
      data: {
        dealId: deal.id,
        txSig: input.txSig,
        slot: BigInt(slot),
        instruction: input.action,
        mint: solanaConfig.usdcMint.toBase58(),
        amount: null,
      },
    });

    return tx.deal.update({
      where: { id: deal.id },
      data: {
        status: nextStatus,
        fundedAt: nextStatus === DealStatus.FUNDED ? new Date() : deal.fundedAt,
        updatedAt: new Date(),
      },
      select: {
        id: true,
        status: true,
        buyerWallet: true,
        sellerWallet: true,
        buyerId: true,
        sellerId: true,
        updatedAt: true,
        fundedAt: true,
        title: true,
        priceUsd: true,
        buyerEmail: true,
        sellerEmail: true,
      },
    });
  });

  // Fire-and-forget reputation update — does not block the response
  if (result.status === DealStatus.RELEASED && result.sellerId && result.buyerId) {
    updateReputationReleased(input.dealId, result.sellerId, result.buyerId).catch(console.error);
  } else if (result.status === DealStatus.REFUNDED && result.sellerId) {
    updateReputationRefunded(input.dealId, result.sellerId).catch(console.error);
  }

  // Fire-and-forget status change email to both parties
  if (result.status !== deal_previousStatus) {
    sendDealStatusNotification({
      dealId: input.dealId,
      dealTitle: result.title,
      amountUsd: result.priceUsd.toString(),
      buyerEmail: result.buyerEmail,
      sellerEmail: result.sellerEmail,
      newStatus: result.status as any,
      actorRole: input.actorWallet === result.buyerWallet ? "buyer" : "seller",
    }).catch(console.error);
  }

  logAction({
    reqId,
    action: "actions.confirm",
    dealId: input.dealId,
    wallet: input.actorWallet,
    txSig: input.txSig,
    slot,
    status: result.status,
    durationMs: Date.now() - startedAt,
  });

  // Send notifications to counterparty (non-blocking)
  const dealId = input.dealId;
  const buyerWallet = result.buyerWallet;
  const sellerWallet = result.sellerWallet;
  if (input.action === "FUND" && sellerWallet) {
    createNotificationByWallet(sellerWallet, "Deal funded", {
      body: "The buyer has funded the escrow. Proceed with delivery.",
      type: "deal",
      dealId,
    });
  } else if (input.action === "RELEASE" && sellerWallet) {
    createNotificationByWallet(sellerWallet, "Payment released", {
      body: "The buyer has released the payment to you.",
      type: "deal",
      dealId,
    });
  } else if (input.action === "REFUND" && buyerWallet) {
    createNotificationByWallet(buyerWallet, "Refund processed", {
      body: "The seller has refunded your payment.",
      type: "deal",
      dealId,
    });
  } else if (input.action === "OPEN_DISPUTE") {
    // Notify the other party
    const counterpartyWallet =
      input.actorWallet === buyerWallet ? sellerWallet : buyerWallet;
    if (counterpartyWallet) {
      createNotificationByWallet(counterpartyWallet, "Dispute opened", {
        body: "The other party has opened a dispute. Submit your evidence.",
        type: "dispute",
        dealId,
      });
    }
  }

  return {
    deal: result,
  };
}

async function updateReputationReleased(dealId: string, sellerId: string, buyerId: string): Promise<void> {
  await prisma.attestation.createMany({
    data: [
      { dealId, subjectUserId: sellerId, kind: AttestationKind.DEAL_SUCCESS, scoreDelta: 5 },
      { dealId, subjectUserId: buyerId, kind: AttestationKind.BUYER_GOOD, scoreDelta: 2 },
    ],
    skipDuplicates: true,
  });
  await prisma.user.update({ where: { id: sellerId }, data: { reputationScore: { increment: 5 } } });
  await prisma.user.update({ where: { id: buyerId }, data: { reputationScore: { increment: 2 } } });
}

async function updateReputationRefunded(dealId: string, sellerId: string): Promise<void> {
  await prisma.attestation.create({
    data: { dealId, subjectUserId: sellerId, kind: AttestationKind.DEAL_DEFAULT, scoreDelta: -5 },
  });
  await prisma.user.update({ where: { id: sellerId }, data: { reputationScore: { decrement: 5 } } });
}

