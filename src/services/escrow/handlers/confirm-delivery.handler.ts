import { DealStatus } from "@prisma/client";
import { PublicKey } from "@solana/web3.js";
import type { ConfirmDeliveryInput, ActionResponse } from "../../../types/actions";
import { rpcManager } from "../../../config/solana";
import { getEscrowPda } from "../../../utils/deal";
import { logAction } from "../../../utils/logger";
import { withRpcRetry } from "../../../utils/rpc-retry";
import { resolveReqId, derivePayer, fetchDealSummary } from "../utils";
import { escrowService } from "../../escrow-service";
import { buildPartiallySigned } from "../../../solana/transaction";

const ESCROW_STATUS_OFFSET = 8 + 1 + 32 + 32 + 32 + 32 + 32 + 8 + 2 + 8; // 187

/**
 * Buyer confirms delivery — builds a resolve(VERDICT_RELEASE) tx partial-signed by arbiter.
 * The buyer signs as fee payer and sends on-chain. After confirmation, the confirm handler
 * creates the ResolveTicket and transitions deal to RESOLVED.
 */
export async function handleConfirmDelivery(
  input: ConfirmDeliveryInput,
  options?: { reqId?: string }
): Promise<ActionResponse> {
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

  const buyerPubkey = new PublicKey(input.buyerWallet);

  // Build resolve instruction with VERDICT_RELEASE, partial-sign with arbiter
  const { ix: resolveIx, arbiterKeypair } = escrowService.buildResolveIx(deal.id, "RELEASE");
  const payerKey = derivePayer(buyerPubkey);
  const txResult = await buildPartiallySigned([resolveIx], payerKey, [arbiterKeypair]);

  logAction({
    reqId,
    action: "actions.confirmDelivery",
    dealId: deal.id,
    wallet: input.buyerWallet,
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
