import { DealStatus } from "@prisma/client";
import { PublicKey, TransactionInstruction } from "@solana/web3.js";
import { TOKEN_PROGRAM_ID } from "@solana/spl-token";
import type { ReleaseActionInput, ActionResponse } from "../../../types/actions";
import { solanaConfig } from "../../../config/solana";
import { deriveAta } from "../../../solana/token";
import { buildVersionedTransaction } from "../../../solana/transaction";
import { dealIdToBytes, getEscrowPda, getEscrowPdaWithParties, getEscrowPdaSeedsScheme } from "../../../utils/deal";
import { logAction } from "../../../utils/logger";
import { RELEASE_DISCRIMINATOR } from "../constants";
import { resolveReqId, derivePayer, fetchDealSummary } from "../utils";

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

  if (deal.buyerWallet !== input.buyerWallet) {
    throw new Error("Caller wallet does not match buyer");
  }

  if (!deal.sellerWallet || !deal.buyerWallet) {
    throw new Error("Deal is missing buyer or seller wallet");
  }

  if (!deal.depositTokenMint) {
    throw new Error("Deal is missing deposit token mint");
  }

  const sellerPubkey = new PublicKey(deal.sellerWallet);
  
  const actualDealId = deal.id;
  const pdaScheme = getEscrowPdaSeedsScheme();
  const { publicKey: escrowPda } =
    pdaScheme === "parties" && deal.sellerWallet && deal.buyerWallet && deal.depositTokenMint
      ? getEscrowPdaWithParties(deal.sellerWallet, deal.buyerWallet, deal.depositTokenMint)
      : getEscrowPda({ dealId: actualDealId });

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
    
  const programIx = new TransactionInstruction({
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
  const txResult = await buildVersionedTransaction([programIx], payerKey);

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

