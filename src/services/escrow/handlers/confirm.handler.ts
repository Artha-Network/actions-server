import { DealStatus } from "@prisma/client";
import type { ConfirmActionInput } from "../../../types/actions";
import { solanaConfig } from "../../../config/solana";
import { logAction } from "../../../utils/logger";
import { isBase58Address } from "../../../utils/validation";
import { rpcManager } from "../../../config/solana";
import { prisma } from "../../../lib/prisma";
import { withRpcRetry } from "../../../utils/rpc-retry";
import { resolveReqId } from "../utils";

export async function handleConfirm(
  input: ConfirmActionInput,
  options?: { reqId?: string }
) {
  const reqId = resolveReqId(options);
  const startedAt = Date.now();

  if (!isBase58Address(input.actorWallet)) {
    throw new Error("Invalid actor wallet");
  }

  // Check if this is a mock signature (development mode - skipping blockchain transaction)
  const isMockSignature = input.txSig.startsWith("11111111111111111111111111111111");

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

  const result = await prisma.$transaction(async (tx) => {
    const deal = await tx.deal.findUnique({ where: { id: input.dealId } });
    if (!deal) throw new Error("Deal not found");

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
        // Fetch ticket to determine if verdict is RELEASE or REFUND
        const ticket = await tx.resolveTicket.findFirst({
          where: { dealId: deal.id },
          orderBy: { issuedAt: "desc" },
        });
        if (!ticket) throw new Error("No resolution ticket found");
        // Set final status based on verdict
        if (ticket.finalAction === "RELEASE") {
          nextStatus = DealStatus.RELEASED;
        } else if (ticket.finalAction === "REFUND") {
          nextStatus = DealStatus.REFUNDED;
        } else {
          throw new Error(`Unsupported verdict: ${ticket.finalAction}`);
        }
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
        updatedAt: true,
        fundedAt: true,
      },
    });
  });

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

  return {
    deal: result,
  };
}

