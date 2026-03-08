import { Prisma, DealStatus } from "@prisma/client";
import { PublicKey, SystemProgram, TransactionInstruction, SYSVAR_RENT_PUBKEY } from "@solana/web3.js";
import { TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID } from "@solana/spl-token";
import type { InitiateActionInput, ActionResponse } from "../../../types/actions";
import { solanaConfig } from "../../../config/solana";
import { u16ToBuffer, u64ToBuffer, i64ToBuffer } from "../../../solana/anchor";
import { parseAmountToUnits, toUsdDecimalString } from "../../../utils/amount";
import { deriveAta } from "../../../solana/token";
import { buildVersionedTransaction } from "../../../solana/transaction";
import { dealIdToBytes, ensureDealId, getEscrowPdaFromBytes } from "../../../utils/deal";
import { upsertWalletIdentity, createUserIfMissing } from "../../user.service";
import { logAction } from "../../../utils/logger";
import { rpcManager } from "../../../config/solana";
import { prisma } from "../../../lib/prisma";
import { withRpcRetry } from "../../../utils/rpc-retry";
import { INITIATE_DISCRIMINATOR } from "../constants";
import { resolveReqId, ensureDeadline, derivePayer, fetchDealSummary } from "../utils";
import { sendCounterpartyNotification, sendDealStatusNotification } from "../../email.service";
import { getArbiterPublicKey } from "../../../utils/keypair";

export async function handleInitiate(
  input: InitiateActionInput,
  options?: { reqId?: string }
): Promise<ActionResponse> {
  const reqId = resolveReqId(options);
  const startedAt = Date.now();

  const amountUsd = toUsdDecimalString(input.amount.toString());
  const deliverAt = ensureDeadline(input.deliverBy);
  const disputeAt = ensureDeadline(input.disputeDeadline ?? deliverAt + 2 * 24 * 60 * 60);

  const dealSeed = {
    sellerWallet: input.sellerWallet,
    buyerWallet: input.buyerWallet,
    amount: amountUsd,
    deliverAt,
  };
  const dealId = ensureDealId(input.clientDealId, dealSeed);

  const sellerPubkey = new PublicKey(input.sellerWallet);
  const buyerPubkey = new PublicKey(input.buyerWallet);
  // Default arbiter: use the arbiter service keypair so on-chain resolve works
  const defaultArbiter = getArbiterPublicKey();
  const arbiterPubkey = input.arbiterWallet
    ? new PublicKey(input.arbiterWallet)
    : defaultArbiter
      ? new PublicKey(defaultArbiter)
      : sellerPubkey;

  const dealIdBytes = dealIdToBytes(dealId);

  if (dealIdBytes.length !== 16) {
    console.error("[initiate] ❌ ERROR: dealIdBytes length mismatch!");
    throw new Error(`dealId bytes must be exactly 16 bytes, got ${dealIdBytes.length}`);
  }

  // PDA seeds: ["escrow", deal_id(16 bytes)] — must match on-chain program (lib.rs)
  const { publicKey: escrowPda, bump } = getEscrowPdaFromBytes(dealIdBytes);

  const [vaultAuthority, vaultBump] = PublicKey.findProgramAddressSync(
    [Buffer.from("vault"), escrowPda.toBuffer()],
    solanaConfig.programId
  );
  const vaultAta = deriveAta(solanaConfig.usdcMint, vaultAuthority, true);

  // Validate mint is a real SPL Token mint on this cluster (avoids AccountOwnedByWrongProgram 0xbbf)
  const mintAccountInfo = await withRpcRetry(
    async (conn) => conn.getAccountInfo(solanaConfig.usdcMint),
    { endpointManager: rpcManager }
  );
  const tokenProgramId = TOKEN_PROGRAM_ID;
  if (!mintAccountInfo || !mintAccountInfo.owner.equals(tokenProgramId)) {
    const actualOwner = mintAccountInfo?.owner?.toBase58() ?? "11111111111111111111111111111111";
    const devnetMint = "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU";
    const mainnetMint = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
    throw new Error(
      `The configured USDC mint (${solanaConfig.usdcMint.toBase58()}) is not a valid SPL Token mint on this cluster (${solanaConfig.cluster}). ` +
        `Account owner: ${actualOwner} (expected Token Program: ${tokenProgramId.toBase58()}). ` +
        `For devnet set USDC_MINT=${devnetMint}. For mainnet set USDC_MINT=${mainnetMint}.`
    );
  }

  const escrowAccountInfo = await withRpcRetry(
    async (conn) => conn.getAccountInfo(escrowPda),
    { endpointManager: rpcManager }
  );

  if (escrowAccountInfo) {
    const existingDealByPda = await prisma.deal.findFirst({
      where: {
        onchainAddress: escrowPda.toBase58(),
        sellerWallet: input.sellerWallet,
        buyerWallet: input.buyerWallet,
      },
      select: { id: true, status: true },
    });

    if (existingDealByPda) {
      if (existingDealByPda.status !== DealStatus.INIT) {
        logAction({
          reqId,
          action: "actions.initiate",
          dealId: existingDealByPda.id,
          wallet: input.sellerWallet,
          status: existingDealByPda.status,
          message: "escrow_account_exists_not_init",
        });
        throw new Error(
          `Escrow account exists and is in ${existingDealByPda.status} status. Use deal ID: ${existingDealByPda.id}`
        );
      }

      logAction({
        reqId,
        action: "actions.initiate",
        dealId: existingDealByPda.id,
        wallet: input.sellerWallet,
        status: existingDealByPda.status,
        message: existingDealByPda.id !== dealId
          ? "escrow_account_exists_different_deal_returning_existing"
          : "escrow_account_already_initialized_continuing",
        durationMs: Date.now() - startedAt,
      });

      let blockhash = "";
      let lastValidBlockHeight = 0;
      try {
        const blockhashResult = await Promise.race([
          withRpcRetry(
            async (conn) => conn.getLatestBlockhash("confirmed"),
            { endpointManager: rpcManager, timeoutMs: 3000, maxAttempts: 2 }
          ),
          new Promise<never>((_, rej) => setTimeout(() => rej(new Error('timeout')), 3000))
        ]) as { blockhash: string; lastValidBlockHeight: number };
        blockhash = blockhashResult.blockhash;
        lastValidBlockHeight = blockhashResult.lastValidBlockHeight;
      } catch (err) {
        console.warn(`[initiate] Failed to fetch blockhash: ${err}`);
      }

      return {
        dealId: existingDealByPda.id,
        txMessageBase64: "",
        nextClientAction: "fund",
        latestBlockhash: blockhash,
        lastValidBlockHeight,
        feePayer: derivePayer(sellerPubkey).toBase58(),
      };
    }

    console.warn("[initiate] ⚠️  WARNING: Account exists but no matching deal in database");
    console.warn("[initiate]   PDA:", escrowPda.toBase58());
    console.warn("[initiate]   Attempted dealId:", dealId);
    console.warn("[initiate]   Continuing with transaction build (skipping PDA mismatch check)");
  }

  const [sellerIdentity, buyerIdentity] = await Promise.all([
    upsertWalletIdentity(input.sellerWallet, solanaConfig.cluster).catch(() =>
      createUserIfMissing(input.sellerWallet)
    ),
    createUserIfMissing(input.buyerWallet),
  ]);

  const existingDeal = await fetchDealSummary(dealId);

  if (existingDeal) {
    if (existingDeal.id !== dealId) {
      console.error("[initiate] ❌ CRITICAL ERROR: Database dealId mismatch (pre-check)!");
      console.error("[initiate]   Database dealId:", existingDeal.id);
      console.error("[initiate]   Request dealId:", dealId);
      console.error("[initiate]   This mismatch will cause PDA derivation errors!");
      throw new Error(
        `Database dealId mismatch: expected ${existingDeal.id}, got ${dealId}. ` +
        `The database dealId must match the request dealId used for PDA derivation and instruction data.`
      );
    }

    if (existingDeal.status !== DealStatus.INIT) {
      logAction({
        reqId,
        action: "actions.initiate",
        dealId,
        wallet: input.sellerWallet,
        status: existingDeal.status,
        message: "deal_already_initialized",
      });
      throw new Error(`Deal already initialized with status: ${existingDeal.status}. Cannot re-initialize.`);
    }
  }

  const usdPriceSnapshot: Prisma.JsonObject = {
    currency: "USDC",
    amount: amountUsd,
    capturedAt: new Date().toISOString(),
  };

  const sellerId = (typeof sellerIdentity === 'object' && 'userId' in sellerIdentity
    ? sellerIdentity.userId
    : sellerIdentity.id) as string;
  const buyerId = (typeof buyerIdentity === 'object' && 'userId' in buyerIdentity
    ? buyerIdentity.userId
    : buyerIdentity.id) as string;

  if (!existingDeal) {
    await prisma.deal.create({
      data: {
        id: dealId,
        sellerId,
        buyerId,
        arbiterPubkey: arbiterPubkey.toBase58(),
        sellerWallet: input.sellerWallet,
        buyerWallet: input.buyerWallet,
        createdByWallet: input.payer ?? input.sellerWallet,
        priceUsd: new Prisma.Decimal(amountUsd),
        depositTokenMint: solanaConfig.usdcMint.toBase58(),
        vaultAta: vaultAta.toBase58(),
        onchainAddress: escrowPda.toBase58(),
        deliverDeadline: new Date(deliverAt * 1000),
        disputeDeadline: new Date(disputeAt * 1000),
        usdPriceSnapshot,
        feeBps: input.feeBps,
        status: DealStatus.INIT,
        title: input.title?.trim() || null,
        description: input.description?.trim() || null,
        buyerEmail: input.buyerEmail?.trim() || null,
        sellerEmail: input.sellerEmail?.trim() || null,
        vin: input.vin?.trim() || null,
        contract: input.contract || null,
        metadata: input.metadata ? (input.metadata as Prisma.InputJsonValue) : Prisma.JsonNull,
      },
    });
  } else {
    await prisma.deal.update({
      where: { id: dealId },
      data: {
        sellerId,
        buyerId,
        sellerWallet: input.sellerWallet,
        buyerWallet: input.buyerWallet,
        arbiterPubkey: arbiterPubkey.toBase58(),
        priceUsd: new Prisma.Decimal(amountUsd),
        depositTokenMint: solanaConfig.usdcMint.toBase58(),
        vaultAta: vaultAta.toBase58(),
        onchainAddress: escrowPda.toBase58(),
        deliverDeadline: new Date(deliverAt * 1000),
        disputeDeadline: new Date(disputeAt * 1000),
        usdPriceSnapshot,
        feeBps: input.feeBps,
        title: input.title?.trim() || null,
        description: input.description?.trim() || null,
        buyerEmail: input.buyerEmail?.trim() || null,
        sellerEmail: input.sellerEmail?.trim() || null,
        vin: input.vin?.trim() || existingDeal.vin,
        contract: input.contract || existingDeal.contract,
        ...(input.metadata !== undefined && { metadata: input.metadata as Prisma.InputJsonValue }),
      },
    });
  }

  const dbDeal = await fetchDealSummary(dealId);
  
  if (!dbDeal) {
    console.error("[initiate] ❌ CRITICAL ERROR: Deal record not found after create/update!");
    throw new Error(`Deal record with id ${dealId} not found in database after create/update operation`);
  }
  
  if (dbDeal.id !== dealId) {
    console.error("[initiate] ❌ CRITICAL ERROR: Database dealId mismatch (post-check)!");
    console.error("[initiate]   Database dealId:", dbDeal.id);
    console.error("[initiate]   Request dealId:", dealId);
    console.error("[initiate]   This mismatch will cause PDA derivation errors!");
    throw new Error(
      `Database dealId mismatch: expected ${dbDeal.id}, got ${dealId}. ` +
      `The database dealId must match the request dealId used for PDA derivation and instruction data.`
    );
  }

  if (dbDeal.onchainAddress && dbDeal.onchainAddress !== escrowPda.toBase58()) {
    console.error("[initiate] ❌ CRITICAL ERROR: Database onchainAddress does not match derived PDA!");
    console.error("[initiate]   Database onchainAddress:", dbDeal.onchainAddress);
    console.error("[initiate]   Derived Escrow PDA:", escrowPda.toBase58());
    throw new Error(
      `Database onchainAddress mismatch: database has ${dbDeal.onchainAddress}, but derived PDA is ${escrowPda.toBase58()}. ` +
      `This indicates the database dealId does not match the dealId used for PDA derivation.`
    );
  }

  // Notify both parties via email about the new deal (fire-and-forget)
  let emailSent = false;
  const buyerEmail = input.buyerEmail?.trim() || null;
  const sellerEmail = input.sellerEmail?.trim() || null;
  if (buyerEmail || sellerEmail) {
    sendDealStatusNotification({
      dealId,
      dealTitle: input.title,
      amountUsd,
      buyerEmail,
      sellerEmail,
      newStatus: "INIT",
      actorRole: "seller",
    }).then(() => { emailSent = true; }).catch((emailErr) => {
      console.error("[initiate] Email send failed (non-blocking):", emailErr);
    });
  }

  const amountUnits = BigInt(parseAmountToUnits(input.amount));
  const discriminator = INITIATE_DISCRIMINATOR;
  const amountBuffer = u64ToBuffer(amountUnits);
  const feeBpsBuffer = u16ToBuffer(input.feeBps);
  const disputeAtBuffer = i64ToBuffer(BigInt(disputeAt));

  // Instruction layout: discriminator(8) + amount(8) + fee_bps(2) + dispute_by(8) + deal_id(16) = 42 bytes
  const data = Buffer.concat([discriminator, amountBuffer, feeBpsBuffer, disputeAtBuffer, dealIdBytes]);

  if (data.length !== 42) {
    throw new Error(`Instruction data must be 42 bytes, got ${data.length}`);
  }

  const instruction = new TransactionInstruction({
    programId: solanaConfig.programId,
    keys: [
      { pubkey: sellerPubkey, isSigner: true, isWritable: true },
      { pubkey: sellerPubkey, isSigner: false, isWritable: false },
      { pubkey: buyerPubkey, isSigner: false, isWritable: false },
      { pubkey: arbiterPubkey, isSigner: false, isWritable: false },
      { pubkey: solanaConfig.usdcMint, isSigner: false, isWritable: false },
      { pubkey: escrowPda, isSigner: false, isWritable: true },
      { pubkey: vaultAuthority, isSigner: false, isWritable: false },
      { pubkey: vaultAta, isSigner: false, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
      { pubkey: ASSOCIATED_TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
      { pubkey: SYSVAR_RENT_PUBKEY, isSigner: false, isWritable: false },
    ],
    data,
  });

  const payerKey = derivePayer(sellerPubkey);
  const txResult = await buildVersionedTransaction([instruction], payerKey);

  logAction({
    reqId,
    action: "actions.initiate",
    dealId,
    wallet: input.sellerWallet,
    durationMs: Date.now() - startedAt,
    status: "INIT",
  });

  return {
    dealId,
    txMessageBase64: txResult.txMessageBase64,
    nextClientAction: "fund",
    latestBlockhash: txResult.latestBlockhash,
    lastValidBlockHeight: txResult.lastValidBlockHeight,
    feePayer: payerKey.toBase58(),
    emailSent,
  };
}

