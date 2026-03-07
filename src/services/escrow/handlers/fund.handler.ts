import { DealStatus } from "@prisma/client";
import { PublicKey, TransactionInstruction } from "@solana/web3.js";
import { TOKEN_PROGRAM_ID } from "@solana/spl-token";
import type { FundActionInput, ActionResponse } from "../../../types/actions";
import { solanaConfig } from "../../../config/solana";
import { buildIdempotentCreateAtaIx, deriveAta } from "../../../solana/token";
import { buildVersionedTransaction } from "../../../solana/transaction";
import { dealIdToBytes, getEscrowPda } from "../../../utils/deal";
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

  const actualDealId = deal.id;
  const { publicKey: escrowPda } = getEscrowPda({ dealId: actualDealId });

  const dealIdBytes = dealIdToBytes(actualDealId);

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

  const payerKey = derivePayer(buyerPubkey);

  // Derive vault authority PDA and vault ATA (must match what initiate created)
  const [vaultAuthority] = PublicKey.findProgramAddressSync(
    [Buffer.from("vault"), escrowPda.toBuffer()],
    solanaConfig.programId
  );
  const vaultAta = deriveAta(solanaConfig.usdcMint, vaultAuthority, true);

  // Ensure buyer ATA exists (idempotent)
  const buyerAtaInfo = buildIdempotentCreateAtaIx(payerKey, buyerPubkey, solanaConfig.usdcMint);

  // Build on-chain fund instruction (the program does the CPI transfer internally)
  const data = Buffer.concat([
    FUND_DISCRIMINATOR,
    dealIdBytes,
  ]);

  const programIx = new TransactionInstruction({
    programId: solanaConfig.programId,
    keys: [
      { pubkey: buyerPubkey, isSigner: true, isWritable: true },
      { pubkey: escrowPda, isSigner: false, isWritable: true },
      { pubkey: buyerAtaInfo.ata, isSigner: false, isWritable: true },
      { pubkey: vaultAta, isSigner: false, isWritable: true },
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
    ],
    data,
  });

  // Only send buyer ATA creation (idempotent) + the program fund instruction.
  // No separate transferChecked — the on-chain fund handler does the CPI transfer.
  const txResult = await buildVersionedTransaction(
    [buyerAtaInfo.instruction, programIx],
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
