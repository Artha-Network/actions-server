import { DealStatus } from "@prisma/client";
import { PublicKey, TransactionInstruction } from "@solana/web3.js";
import { createTransferCheckedInstruction, TOKEN_PROGRAM_ID } from "@solana/spl-token";
import type { FundActionInput, ActionResponse } from "../../../types/actions";
import { solanaConfig } from "../../../config/solana";
import { parseAmountToUnits } from "../../../utils/amount";
import { buildIdempotentCreateAtaIx } from "../../../solana/token";
import { buildVersionedTransaction } from "../../../solana/transaction";
import { dealIdToBytes, getEscrowPda, getEscrowPdaWithParties, getEscrowPdaSeedsScheme } from "../../../utils/deal";
import { logAction } from "../../../utils/logger";
import { rpcManager } from "../../../config/solana";
import { withRpcRetry } from "../../../utils/rpc-retry";
import { FUND_DISCRIMINATOR } from "../constants";
import { resolveReqId, derivePayer, fetchDealSummary } from "../utils";

export async function handleFund(
  input: FundActionInput,
  options?: { reqId?: string }
): Promise<ActionResponse> {
  const reqId = resolveReqId(options);
  const startedAt = Date.now();

  const deal = await fetchDealSummary(input.dealId);
  if (!deal) throw new Error("Deal not found");

  if (deal.status !== DealStatus.INIT) {
    throw new Error(`Deal status ${deal.status} cannot be funded`);
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

  const buyerPubkey = new PublicKey(input.buyerWallet);
  const amountUnits = parseAmountToUnits(input.amount);
  
  const actualDealId = deal.id;
  const pdaScheme = getEscrowPdaSeedsScheme();
  const { publicKey: escrowPda, bump } =
    pdaScheme === "parties" && deal.sellerWallet && deal.buyerWallet && deal.depositTokenMint
      ? getEscrowPdaWithParties(deal.sellerWallet, deal.buyerWallet, deal.depositTokenMint)
      : getEscrowPda({ dealId: actualDealId });

  const dealIdBytes = dealIdToBytes(actualDealId);
  if (pdaScheme === "deal_id") {
    const [verifiedPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("escrow"), dealIdBytes],
      solanaConfig.programId
    );
    if (escrowPda.toBase58() !== verifiedPda.toBase58()) {
      throw new Error(
        `PDA derivation mismatch: derived ${escrowPda.toBase58()} but verified ${verifiedPda.toBase58()}`
      );
    }
  }
  
  let escrowAccountInfo = null;
  try {
    escrowAccountInfo = await withRpcRetry(
      async (conn) => conn.getAccountInfo(escrowPda),
      { endpointManager: rpcManager, timeoutMs: 3000, maxAttempts: 2 }
    );
  } catch (err) {
    console.error(`[fund] Failed to fetch escrow account info: ${err}`);
    throw new Error(
      `Escrow account does not exist on-chain. The deal must be initiated first before funding. ` +
      `Escrow PDA: ${escrowPda.toBase58()}`
    );
  }
  
  if (!escrowAccountInfo) {
    throw new Error(
      `Escrow account does not exist on-chain. The deal must be initiated first before funding. ` +
      `Escrow PDA: ${escrowPda.toBase58()}`
    );
  }
  
  console.log("[fund] ✅ PDA verified:", escrowPda.toBase58());
  console.log("[fund] ✅ Account exists on-chain");
  console.log("[fund] ======================");
  const payerKey = derivePayer(buyerPubkey);

  const buyerAtaInfo = buildIdempotentCreateAtaIx(payerKey, buyerPubkey, solanaConfig.usdcMint);
  const vaultAtaInfo = buildIdempotentCreateAtaIx(payerKey, escrowPda, solanaConfig.usdcMint, true);

  const transferIx = createTransferCheckedInstruction(
    buyerAtaInfo.ata,
    solanaConfig.usdcMint,
    vaultAtaInfo.ata,
    buyerPubkey,
    amountUnits,
    solanaConfig.usdcDecimals
  );

  console.log("=== Fund Instruction Data Debug ===");
  console.log("Input Deal ID:", input.dealId);
  console.log("Actual Deal ID (from DB):", actualDealId);
  console.log("Deal ID bytes (hex):", dealIdBytes.toString("hex"));
  console.log("Deal ID bytes length:", dealIdBytes.length);
  console.log("Escrow PDA (derived with this deal_id):", escrowPda.toBase58());
  console.log("===================================");
  
  const data = Buffer.concat([
    FUND_DISCRIMINATOR,
    dealIdBytes,
  ]);
  
  console.log("Fund instruction data length:", data.length);
  console.log("  Discriminator (8 bytes):", data.slice(0, 8).toString("hex"));
  console.log("  Deal ID (16 bytes):", data.slice(8, 24).toString("hex"));
  
  const programIx = new TransactionInstruction({
    programId: solanaConfig.programId,
    keys: [
      { pubkey: buyerPubkey, isSigner: true, isWritable: true },
      { pubkey: escrowPda, isSigner: false, isWritable: true },
      { pubkey: buyerAtaInfo.ata, isSigner: false, isWritable: true },
      { pubkey: vaultAtaInfo.ata, isSigner: false, isWritable: true },
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
    ],
    data,
  });

  const txResult = await buildVersionedTransaction(
    [buyerAtaInfo.instruction, vaultAtaInfo.instruction, transferIx, programIx],
    payerKey
  );

  logAction({
    reqId,
    action: "actions.fund",
    dealId: deal.id,
    wallet: input.buyerWallet,
    durationMs: Date.now() - startedAt,
    status: "INIT",
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

