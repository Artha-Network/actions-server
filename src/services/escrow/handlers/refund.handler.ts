import { DealStatus } from "@prisma/client";
import { PublicKey, TransactionInstruction } from "@solana/web3.js";
import { TOKEN_PROGRAM_ID } from "@solana/spl-token";
import type { RefundActionInput, ActionResponse } from "../../../types/actions";
import { solanaConfig } from "../../../config/solana";
import { deriveAta } from "../../../solana/token";
import { buildVersionedTransaction } from "../../../solana/transaction";
import { dealIdToBytes, getEscrowPda } from "../../../utils/deal";
import { logAction } from "../../../utils/logger";
import { REFUND_DISCRIMINATOR } from "../constants";
import { resolveReqId, derivePayer, fetchDealSummary } from "../utils";

export async function handleRefund(
  input: RefundActionInput,
  options?: { reqId?: string }
): Promise<ActionResponse> {
  const reqId = resolveReqId(options);
  const startedAt = Date.now();

  const deal = await fetchDealSummary(input.dealId);
  if (!deal) throw new Error("Deal not found");

  if (!(deal.status === DealStatus.FUNDED || deal.status === DealStatus.RESOLVED)) {
    throw new Error(`Deal status ${deal.status} cannot be refunded`);
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

  const buyerPubkey = new PublicKey(deal.buyerWallet);
  
  const actualDealId = deal.id;
  const { publicKey: escrowPda } = getEscrowPda({
    dealId: actualDealId,
  });

  const [vaultAuthority] = PublicKey.findProgramAddressSync(
    [Buffer.from("vault"), escrowPda.toBuffer()],
    solanaConfig.programId
  );

  const vaultAta = deriveAta(solanaConfig.usdcMint, vaultAuthority, true);
  const buyerAta = deriveAta(solanaConfig.usdcMint, buyerPubkey);

  const dealIdBytes = dealIdToBytes(actualDealId);
  const data = Buffer.concat([
    REFUND_DISCRIMINATOR,
    dealIdBytes,
  ]);
    
  const programIx = new TransactionInstruction({
    programId: solanaConfig.programId,
    keys: [
      { pubkey: buyerPubkey, isSigner: true, isWritable: true },
      { pubkey: escrowPda, isSigner: false, isWritable: true },
      { pubkey: vaultAuthority, isSigner: false, isWritable: false },
      { pubkey: vaultAta, isSigner: false, isWritable: true },
      { pubkey: buyerAta, isSigner: false, isWritable: true },
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
    ],
    data,
  });

  const payerKey = derivePayer(buyerPubkey);
  const txResult = await buildVersionedTransaction([programIx], payerKey);

  logAction({
    reqId,
    action: "actions.refund",
    dealId: deal.id,
    wallet: deal.buyerWallet,
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

