import { DealStatus } from "@prisma/client";
import { PublicKey, TransactionInstruction } from "@solana/web3.js";
import { TOKEN_PROGRAM_ID } from "@solana/spl-token";
import type { ReleaseActionInput, ActionResponse } from "../../../types/actions";
import { solanaConfig, rpcManager } from "../../../config/solana";
import { deriveAta } from "../../../solana/token";
import { buildVersionedTransaction, buildPartiallySigned } from "../../../solana/transaction";
import { dealIdToBytes, getEscrowPda } from "../../../utils/deal";
import { logAction } from "../../../utils/logger";
import { withRpcRetry } from "../../../utils/rpc-retry";
import { RELEASE_DISCRIMINATOR } from "../constants";
import { resolveReqId, derivePayer, fetchDealSummary } from "../utils";
import { escrowService } from "../../escrow-service";

const ESCROW_STATUS_OFFSET = 8 + 1 + 32 + 32 + 32 + 32 + 32 + 8 + 2 + 8; // 187
const STATUS_NAMES = ["Init", "Funded", "Disputed", "Resolved", "Released", "Refunded"];

export async function handleRelease(
  input: ReleaseActionInput,
  options?: { reqId?: string }
): Promise<ActionResponse> {
  const reqId = resolveReqId(options);
  const startedAt = Date.now();

  const deal = await fetchDealSummary(input.dealId);
  if (!deal) throw new Error("Deal not found");

  if (!(deal.status === DealStatus.FUNDED || deal.status === DealStatus.RESOLVED)) {
    throw new Error(`Deal status ${deal.status} cannot be released`);
  }

  if (deal.sellerWallet !== input.sellerWallet) {
    throw new Error("Caller wallet does not match seller");
  }

  if (!deal.sellerWallet || !deal.buyerWallet) {
    throw new Error("Deal is missing buyer or seller wallet");
  }

  if (!deal.depositTokenMint) {
    throw new Error("Deal is missing deposit token mint");
  }

  const sellerPubkey = new PublicKey(input.sellerWallet);

  const actualDealId = deal.id;
  const { publicKey: escrowPda } = getEscrowPda({ dealId: actualDealId });

  // Check on-chain escrow state before building tx
  const escrowAccountInfo = await withRpcRetry(
    async (conn) => conn.getAccountInfo(escrowPda),
    { endpointManager: rpcManager, timeoutMs: 3000, maxAttempts: 2 }
  );
  if (!escrowAccountInfo) {
    throw new Error(`Escrow account not found on-chain. PDA: ${escrowPda.toBase58()}`);
  }
  let onChainStatus = escrowAccountInfo.data[ESCROW_STATUS_OFFSET];
  let statusName = STATUS_NAMES[onChainStatus] ?? `Unknown(${onChainStatus})`;
  console.log(`[release] Deal ${actualDealId} on-chain status: ${statusName} (${onChainStatus}), DB status: ${deal.status}`);

  // If on-chain is Disputed but DB is RESOLVED, prepend resolve ix to the same tx
  let needsResolve = onChainStatus === 2 /* Disputed */ && deal.status === DealStatus.RESOLVED;

  // Verify the on-chain arbiter matches our keypair before attempting resolve
  if (needsResolve) {
    const ARBITER_OFFSET = 8 + 1 + 32 + 32; // discriminator + version + seller + buyer
    const onChainArbiter = new PublicKey(escrowAccountInfo.data.slice(ARBITER_OFFSET, ARBITER_OFFSET + 32));
    const { arbiterKeypair: checkKeypair } = escrowService.buildResolveIx(actualDealId, "RELEASE");
    if (!onChainArbiter.equals(checkKeypair.publicKey)) {
      console.warn(`[release] On-chain arbiter ${onChainArbiter.toBase58()} does not match server arbiter ${checkKeypair.publicKey.toBase58()}. Cannot auto-resolve.`);
      throw new Error(`On-chain escrow is in "${statusName}" state and the arbiter key does not match. This deal was created before the arbiter was configured. Please create a new deal to use AI arbitration.`);
    }
  }

  if (!needsResolve && onChainStatus !== 1 /* Funded */ && onChainStatus !== 3 /* Resolved */) {
    throw new Error(`On-chain escrow is in "${statusName}" state — cannot release. Expected Funded or Resolved.`);
  }

  const [vaultAuthority] = PublicKey.findProgramAddressSync(
    [Buffer.from("vault"), escrowPda.toBuffer()],
    solanaConfig.programId
  );

  const vaultAta = deriveAta(solanaConfig.usdcMint, vaultAuthority, true);
  const sellerAta = deriveAta(solanaConfig.usdcMint, sellerPubkey);

  const dealIdBytes = dealIdToBytes(actualDealId);
  const data = Buffer.concat([
    RELEASE_DISCRIMINATOR,
    dealIdBytes,
  ]);

  const releaseIx = new TransactionInstruction({
    programId: solanaConfig.programId,
    keys: [
      { pubkey: sellerPubkey, isSigner: true, isWritable: true },
      { pubkey: escrowPda, isSigner: false, isWritable: true },
      { pubkey: vaultAuthority, isSigner: false, isWritable: false },
      { pubkey: vaultAta, isSigner: false, isWritable: true },
      { pubkey: sellerAta, isSigner: false, isWritable: true },
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
    ],
    data,
  });

  const payerKey = derivePayer(sellerPubkey);

  let txResult;
  if (needsResolve) {
    console.log(`[release] Combining resolve + release in single tx for deal ${actualDealId}`);
    const { ix: resolveIx, arbiterKeypair } = escrowService.buildResolveIx(actualDealId, "RELEASE");
    txResult = await buildPartiallySigned([resolveIx, releaseIx], payerKey, [arbiterKeypair]);
  } else {
    txResult = await buildVersionedTransaction([releaseIx], payerKey);
  }

  logAction({
    reqId,
    action: "actions.release",
    dealId: deal.id,
    wallet: deal.sellerWallet,
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

