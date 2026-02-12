import { Prisma, DealStatus } from "@prisma/client";
import { PublicKey, SystemProgram, TransactionInstruction, SYSVAR_RENT_PUBKEY } from "@solana/web3.js";
import { TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID } from "@solana/spl-token";
import type { InitiateActionInput, ActionResponse } from "../../../types/actions";
import { solanaConfig } from "../../../config/solana";
import { u16ToBuffer, u64ToBuffer, i64ToBuffer } from "../../../solana/anchor";
import { parseAmountToUnits, toUsdDecimalString } from "../../../utils/amount";
import { deriveAta } from "../../../solana/token";
import { buildVersionedTransaction } from "../../../solana/transaction";
import { dealIdToBytes, ensureDealId, getEscrowPda, getEscrowPdaWithParties, getEscrowPdaSeedsScheme } from "../../../utils/deal";
import { upsertWalletIdentity, createUserIfMissing } from "../../user.service";
import { logAction } from "../../../utils/logger";
import { rpcManager } from "../../../config/solana";
import { prisma } from "../../../lib/prisma";
import { withRpcRetry } from "../../../utils/rpc-retry";
import { INITIATE_DISCRIMINATOR } from "../constants";
import { resolveReqId, ensureDeadline, derivePayer, fetchDealSummary } from "../utils";

export async function handleInitiate(
  input: InitiateActionInput,
  options?: { reqId?: string }
): Promise<ActionResponse> {
  const reqId = resolveReqId(options);
  const startedAt = Date.now();

  console.log("[initiate] ===== START INITIATE FLOW =====");
  console.log("[initiate] Input:", {
    sellerWallet: input.sellerWallet,
    buyerWallet: input.buyerWallet,
    arbiterWallet: input.arbiterWallet,
    amount: input.amount,
    feeBps: input.feeBps,
    clientDealId: input.clientDealId,
    deliverBy: input.deliverBy,
    disputeDeadline: input.disputeDeadline,
  });

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

  console.log("[initiate] Step 1: Deal ID Generation");
  console.log("[initiate]   Original dealId string:", dealId);
  console.log("[initiate]   Deal seed:", JSON.stringify(dealSeed, null, 2));

  const sellerPubkey = new PublicKey(input.sellerWallet);
  const buyerPubkey = new PublicKey(input.buyerWallet);
  const arbiterPubkey = input.arbiterWallet ? new PublicKey(input.arbiterWallet) : sellerPubkey;

  console.log("[initiate] Step 2: Public Key Conversion");
  console.log("[initiate]   Seller pubkey:", sellerPubkey.toBase58());
  console.log("[initiate]   Buyer pubkey:", buyerPubkey.toBase58());
  console.log("[initiate]   Arbiter pubkey:", arbiterPubkey.toBase58());

  const pdaSeedsScheme = getEscrowPdaSeedsScheme();
  console.log("[initiate] PDA seeds scheme:", pdaSeedsScheme);

  const dealIdBytes = dealIdToBytes(dealId);
  console.log("[initiate] Step 3: Deal ID to Bytes Conversion");
  console.log("[initiate]   dealId string:", dealId);
  console.log("[initiate]   dealIdBytes length:", dealIdBytes.length, "bytes");
  console.log("[initiate]   dealIdBytes hex:", dealIdBytes.toString("hex"));

  if (dealIdBytes.length !== 16) {
    console.error("[initiate] ❌ ERROR: dealIdBytes length mismatch!");
    throw new Error(`dealId bytes must be exactly 16 bytes, got ${dealIdBytes.length}`);
  }

  const { publicKey: escrowPda, bump } =
    pdaSeedsScheme === "parties"
      ? getEscrowPdaWithParties(input.sellerWallet, input.buyerWallet, solanaConfig.usdcMint.toBase58())
      : getEscrowPda({ dealId });

  console.log("[initiate] Step 4: PDA Derivation");
  console.log("[initiate]   Program ID:", solanaConfig.programId.toBase58());
  console.log("[initiate]   Seeds scheme:", pdaSeedsScheme);
  console.log("[initiate]   Derived Escrow PDA:", escrowPda.toBase58());
  console.log("[initiate]   Bump:", bump);

  const [vaultAuthority, vaultBump] = PublicKey.findProgramAddressSync(
    [Buffer.from("vault"), escrowPda.toBuffer()],
    solanaConfig.programId
  );
  const vaultAta = deriveAta(solanaConfig.usdcMint, vaultAuthority, true);
  console.log("[initiate]   Vault Authority PDA:", vaultAuthority.toBase58(), "(bump:", vaultBump + ")");
  console.log("[initiate]   Vault ATA:", vaultAta.toBase58());

  const escrowAccountInfo = await withRpcRetry(
    async (conn) => conn.getAccountInfo(escrowPda),
    { endpointManager: rpcManager }
  );

  console.log("[initiate] Step 5: Account Existence Check");
  console.log("[initiate]   Escrow PDA:", escrowPda.toBase58());
  console.log("[initiate]   Account exists:", !!escrowAccountInfo);

  if (escrowAccountInfo) {
    console.log("[initiate]   Account details:", {
      owner: escrowAccountInfo.owner.toBase58(),
      dataLength: escrowAccountInfo.data.length,
      lamports: escrowAccountInfo.lamports,
      executable: escrowAccountInfo.executable,
    });

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

  console.log("[initiate]   ✅ Account does not exist - proceeding with initialization");

  const [sellerIdentity, buyerIdentity] = await Promise.all([
    upsertWalletIdentity(input.sellerWallet, solanaConfig.cluster).catch(() =>
      createUserIfMissing(input.sellerWallet)
    ),
    createUserIfMissing(input.buyerWallet),
  ]);

  console.log("[initiate] Step 5.5: Database Deal ID Validation (Pre-Check)");
  console.log("[initiate]   Fetching deal record from database using dealId:", dealId);
  const existingDeal = await fetchDealSummary(dealId);
  
  if (existingDeal) {
    console.log("[initiate]   Database deal record found (pre-check):");
    console.log("[initiate]     Database dealId:", existingDeal.id);
    console.log("[initiate]     Request dealId:", dealId);
    console.log("[initiate]     Database dealId matches request dealId:", existingDeal.id === dealId ? "✅ YES" : "❌ NO");
    console.log("[initiate]     Status:", existingDeal.status);
    
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
    console.log("[initiate]   ✅ Database dealId matches request dealId (pre-check)");
    
    if (existingDeal.status === DealStatus.INIT) {
      console.log("[initiate]   Deal exists in INIT status - proceeding with wallet signature verification");
    } else {
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
  } else {
    console.log("[initiate]   Database deal record not found (new deal)");
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
        arbiterPubkey: input.arbiterWallet ?? input.sellerWallet,
        sellerWallet: input.sellerWallet,
        buyerWallet: input.buyerWallet,
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
        buyerEmail: input.buyerEmail?.trim() || null,
        sellerEmail: input.sellerEmail?.trim() || null,
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
        arbiterPubkey: input.arbiterWallet ?? existingDeal.arbiterPubkey,
        priceUsd: new Prisma.Decimal(amountUsd),
        depositTokenMint: solanaConfig.usdcMint.toBase58(),
        vaultAta: vaultAta.toBase58(),
        onchainAddress: escrowPda.toBase58(),
        deliverDeadline: new Date(deliverAt * 1000),
        disputeDeadline: new Date(disputeAt * 1000),
        usdPriceSnapshot,
        feeBps: input.feeBps,
        title: input.title?.trim() || null,
        buyerEmail: input.buyerEmail?.trim() || null,
        sellerEmail: input.sellerEmail?.trim() || null,
      },
    });
  }

  console.log("[initiate] Step 5.6: Database Deal ID Validation (Post-Create/Update)");
  console.log("[initiate]   Re-fetching deal record from database to verify consistency");
  const dbDeal = await fetchDealSummary(dealId);
  
  if (!dbDeal) {
    console.error("[initiate] ❌ CRITICAL ERROR: Deal record not found after create/update!");
    throw new Error(`Deal record with id ${dealId} not found in database after create/update operation`);
  }
  
  console.log("[initiate]   Database deal record found (post-check):");
  console.log("[initiate]     Database dealId:", dbDeal.id);
  console.log("[initiate]     Request dealId:", dealId);
  console.log("[initiate]     Database dealId matches request dealId:", dbDeal.id === dealId ? "✅ YES" : "❌ NO");
  
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
  console.log("[initiate]   ✅ Database dealId matches request dealId (post-check)");
  
  console.log("[initiate]   Database deal details:");
  console.log("[initiate]     Status:", dbDeal.status);
  console.log("[initiate]     Onchain Address:", dbDeal.onchainAddress);
  console.log("[initiate]     Seller Wallet:", dbDeal.sellerWallet);
  console.log("[initiate]     Buyer Wallet:", dbDeal.buyerWallet);
  
  if (dbDeal.onchainAddress && dbDeal.onchainAddress !== escrowPda.toBase58()) {
    console.error("[initiate] ❌ CRITICAL ERROR: Database onchainAddress does not match derived PDA!");
    console.error("[initiate]   Database onchainAddress:", dbDeal.onchainAddress);
    console.error("[initiate]   Derived Escrow PDA:", escrowPda.toBase58());
    throw new Error(
      `Database onchainAddress mismatch: database has ${dbDeal.onchainAddress}, but derived PDA is ${escrowPda.toBase58()}. ` +
      `This indicates the database dealId does not match the dealId used for PDA derivation.`
    );
  }
  console.log("[initiate]   ✅ Database onchainAddress matches derived PDA");
  console.log("[initiate]   ✅ All database validations passed - proceeding to instruction data construction");

  const amountUnits = BigInt(parseAmountToUnits(input.amount));
  console.log("[initiate] Step 6: Instruction Data Construction");
  console.log("[initiate]   Amount (USD):", input.amount);
  console.log("[initiate]   Amount (units):", amountUnits.toString());
  console.log("[initiate]   Fee BPS:", input.feeBps);
  console.log("[initiate]   Dispute At (unix):", disputeAt);

  const discriminator = INITIATE_DISCRIMINATOR;
  const amountBuffer = u64ToBuffer(amountUnits);
  const feeBpsBuffer = u16ToBuffer(input.feeBps);
  const disputeAtBuffer = i64ToBuffer(BigInt(disputeAt));

  const data =
    pdaSeedsScheme === "parties"
      ? Buffer.concat([discriminator, amountBuffer, feeBpsBuffer, disputeAtBuffer])
      : Buffer.concat([discriminator, amountBuffer, feeBpsBuffer, disputeAtBuffer, dealIdBytes]);

  const expectedLen = pdaSeedsScheme === "parties" ? 26 : 42;
  if (data.length !== expectedLen) {
    throw new Error(
      `Instruction data must be ${expectedLen} bytes (parties: 26, deal_id: 42), got ${data.length}`
    );
  }

  if (pdaSeedsScheme === "deal_id") {
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

  console.log("[initiate] Step 8: Transaction Instruction Accounts");
  console.log("[initiate]   Program ID:", solanaConfig.programId.toBase58());
  console.log("[initiate]   Accounts (in order):");
  console.log("[initiate]     [0]  Payer/Seller (signer, writable):", sellerPubkey.toBase58());
  console.log("[initiate]     [1]  Seller (not signer, not writable):", sellerPubkey.toBase58());
  console.log("[initiate]     [2]  Buyer (not signer, not writable):", buyerPubkey.toBase58());
  console.log("[initiate]     [3]  Arbiter (not signer, not writable):", arbiterPubkey.toBase58());
  console.log("[initiate]     [4]  Mint (not signer, not writable):", solanaConfig.usdcMint.toBase58());
  console.log("[initiate]     [5]  Escrow PDA (not signer, writable):", escrowPda.toBase58());
  console.log("[initiate]     [6]  Vault Authority (not signer, not writable):", vaultAuthority.toBase58());
  console.log("[initiate]     [7]  Vault ATA (not signer, writable):", vaultAta.toBase58());
  console.log("[initiate]     [8]  System Program (not signer, not writable):", SystemProgram.programId.toBase58());
  console.log("[initiate]     [9]  Token Program (not signer, not writable):", TOKEN_PROGRAM_ID.toBase58());
  console.log("[initiate]     [10] Associated Token Program (not signer, not writable):", ASSOCIATED_TOKEN_PROGRAM_ID.toBase58());
  console.log("[initiate]     [11] Rent Sysvar (not signer, not writable):", SYSVAR_RENT_PUBKEY.toBase58());

  const payerKey = derivePayer(sellerPubkey);
  console.log("[initiate] Step 9: Transaction Building");
  console.log("[initiate]   Fee Payer:", payerKey.toBase58());
  console.log("[initiate]   Instruction data length:", data.length, "bytes");
  console.log("[initiate]   Instruction data hex:", data.toString("hex"));

  const txResult = await buildVersionedTransaction([instruction], payerKey);

  console.log("[initiate] Step 10: Transaction Result");
  console.log("[initiate]   Latest Blockhash:", txResult.latestBlockhash);
  console.log("[initiate]   Last Valid Block Height:", txResult.lastValidBlockHeight);
  console.log("[initiate]   Transaction Message (base64 length):", txResult.txMessageBase64.length, "chars");

  logAction({
    reqId,
    action: "actions.initiate",
    dealId,
    wallet: input.sellerWallet,
    durationMs: Date.now() - startedAt,
    status: "INIT",
  });

  console.log("[initiate] ===== END INITIATE FLOW =====");
  console.log("[initiate] Final Result:", {
    dealId,
    escrowPda: escrowPda.toBase58(),
    nextClientAction: "fund",
  });

  return {
    dealId,
    txMessageBase64: txResult.txMessageBase64,
    nextClientAction: "fund",
    latestBlockhash: txResult.latestBlockhash,
    lastValidBlockHeight: txResult.lastValidBlockHeight,
    feePayer: payerKey.toBase58(),
  };
}

