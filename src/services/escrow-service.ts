import { randomUUID } from "crypto";
import { Prisma, PrismaClient, DealStatus } from "@prisma/client";
import { PublicKey, SystemProgram, TransactionInstruction, SYSVAR_RENT_PUBKEY } from "@solana/web3.js";
import { createTransferCheckedInstruction, TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID } from "@solana/spl-token";
import {
  InitiateActionInput,
  FundActionInput,
  ReleaseActionInput,
  RefundActionInput,
  ConfirmActionInput,
  ActionResponse,
} from "../types/actions";
import { solanaConfig, FEE_PAYER } from "../config/solana";
import { getInstructionDiscriminator, u16ToBuffer, u64ToBuffer, u128ToBuffer, i64ToBuffer } from "../solana/anchor";
import { parseAmountToUnits, toUsdDecimalString } from "../utils/amount";
import { buildIdempotentCreateAtaIx, deriveAta } from "../solana/token";
import { buildVersionedTransaction } from "../solana/transaction";
import { dealIdToBigInt, ensureDealId, getEscrowPda } from "../utils/deal";
import { upsertWalletIdentity } from "./user.service";
import { logAction } from "../utils/logger";
import { isBase58Address } from "../utils/validation";
import { connection } from "../config/solana";

const prisma = new PrismaClient();

const USDC_DECIMALS = 6;

interface ServiceOptions {
  reqId?: string;
}

interface DealSummary {
  id: string;
  status: DealStatus;
  buyerWallet: string | null;
  sellerWallet: string | null;
  arbiterPubkey: string;
  priceUsd: Prisma.Decimal;
  depositTokenMint: string;
  vaultAta: string;
  onchainAddress: string;
  deliverDeadline: Date;
  disputeDeadline: Date;
  createdAt: Date;
  updatedAt: Date;
  fundedAt: Date | null;
}

const INITIATE_DISCRIMINATOR = getInstructionDiscriminator("initiate");
const FUND_DISCRIMINATOR = getInstructionDiscriminator("fund");
const RELEASE_DISCRIMINATOR = getInstructionDiscriminator("release");
const REFUND_DISCRIMINATOR = getInstructionDiscriminator("refund");

function resolveReqId(options?: ServiceOptions) {
  return options?.reqId ?? randomUUID();
}

function secondsFromUnix(timestamp?: number) {
  if (typeof timestamp === "number" && Number.isFinite(timestamp)) return timestamp;
  return Math.floor(Date.now() / 1000);
}

function ensureDeadline(unixTs?: number, fallbackDays = 3) {
  if (unixTs && unixTs > 0) return unixTs;
  return secondsFromUnix() + fallbackDays * 24 * 60 * 60;
}

function derivePayer(candidate?: PublicKey, fallback?: PublicKey) {
  if (solanaConfig.sponsoredFees && FEE_PAYER) {
    return FEE_PAYER;
  }
  if (candidate) return candidate;
  if (fallback) return fallback;
  throw new Error("Unable to determine transaction fee payer");
}

async function fetchDealSummary(id: string): Promise<DealSummary | null> {
  return prisma.deal.findUnique({
    where: { id },
    select: {
      id: true,
      status: true,
      buyerWallet: true,
      sellerWallet: true,
      arbiterPubkey: true,
      priceUsd: true,
      depositTokenMint: true,
      vaultAta: true,
      onchainAddress: true,
      deliverDeadline: true,
      disputeDeadline: true,
      createdAt: true,
      updatedAt: true,
      fundedAt: true,
    },
  });
}

export class EscrowService {
  async initiate(input: InitiateActionInput, options?: ServiceOptions): Promise<ActionResponse> {
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
    const dealIdBigInt = dealIdToBigInt(dealId);

    const sellerPubkey = new PublicKey(input.sellerWallet);
    const buyerPubkey = new PublicKey(input.buyerWallet);
    const { publicKey: escrowPda } = getEscrowPda({
      seller: sellerPubkey,
      buyer: buyerPubkey,
      mint: solanaConfig.usdcMint,
    });
    const vaultAta = deriveAta(solanaConfig.usdcMint, escrowPda, true);

    const [sellerIdentity, buyerIdentity] = await Promise.all([
      upsertWalletIdentity(input.sellerWallet, solanaConfig.cluster),
      upsertWalletIdentity(input.buyerWallet, solanaConfig.cluster),
    ]);

    const existingDeal = await fetchDealSummary(dealId);

    if (existingDeal && existingDeal.status !== DealStatus.INIT) {
      logAction({
        reqId,
        action: "actions.initiate",
        dealId,
        wallet: input.sellerWallet,
        status: existingDeal.status,
        message: "deal_already_initialized",
      });
      throw new Error("Deal already initialized");
    }

    const usdPriceSnapshot: Prisma.JsonObject = {
      currency: "USDC",
      amount: amountUsd,
      capturedAt: new Date().toISOString(),
    };

    if (!existingDeal) {
      await prisma.deal.create({
        data: {
          id: dealId,
          sellerId: sellerIdentity.userId,
          buyerId: buyerIdentity.userId,
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
        },
      });
    } else {
      await prisma.deal.update({
        where: { id: dealId },
        data: {
          sellerId: sellerIdentity.userId,
          buyerId: buyerIdentity.userId,
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
        },
      });
    }

    const data = Buffer.concat([
      INITIATE_DISCRIMINATOR,
      u64ToBuffer(BigInt(parseAmountToUnits(input.amount))), // amount in token units
      u16ToBuffer(input.feeBps),
      i64ToBuffer(BigInt(disputeAt)),
    ]);

    // Get arbiter pubkey
    const arbiterPubkey = input.arbiterWallet ? new PublicKey(input.arbiterWallet) : sellerPubkey;
    
    // Derive vault authority PDA
    const [vaultAuthority, vaultBump] = PublicKey.findProgramAddressSync(
      [Buffer.from("vault"), escrowPda.toBuffer()],
      solanaConfig.programId
    );

    const instruction = new TransactionInstruction({
      programId: solanaConfig.programId,
      keys: [
        { pubkey: sellerPubkey, isSigner: true, isWritable: true },
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
    };
  }

  async fund(input: FundActionInput, options?: ServiceOptions): Promise<ActionResponse> {
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
    const { publicKey: escrowPda } = getEscrowPda({
      seller: deal.sellerWallet,
      buyer: deal.buyerWallet,
      mint: deal.depositTokenMint,
    });
    const payerKey = derivePayer(buyerPubkey);

    const buyerAtaInfo = buildIdempotentCreateAtaIx(payerKey, buyerPubkey, solanaConfig.usdcMint);
    const vaultAtaInfo = buildIdempotentCreateAtaIx(payerKey, escrowPda, solanaConfig.usdcMint, true);

    const transferIx = createTransferCheckedInstruction(
      buyerAtaInfo.ata,
      solanaConfig.usdcMint,
      vaultAtaInfo.ata,
      buyerPubkey,
      amountUnits,
      USDC_DECIMALS
    );

    const data = Buffer.concat([FUND_DISCRIMINATOR, u64ToBuffer(amountUnits)]);
    const programIx = new TransactionInstruction({
      programId: solanaConfig.programId,
      keys: [
        { pubkey: buyerPubkey, isSigner: true, isWritable: true },
        { pubkey: escrowPda, isSigner: false, isWritable: true },
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

  async release(input: ReleaseActionInput, options?: ServiceOptions): Promise<ActionResponse> {
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

    const buyerPubkey = new PublicKey(input.buyerWallet);
    const { publicKey: escrowPda } = getEscrowPda({
      seller: deal.sellerWallet,
      buyer: deal.buyerWallet,
      mint: deal.depositTokenMint,
    });

    const data = Buffer.from(RELEASE_DISCRIMINATOR);
    const programIx = new TransactionInstruction({
      programId: solanaConfig.programId,
      keys: [
        { pubkey: buyerPubkey, isSigner: true, isWritable: true },
        { pubkey: escrowPda, isSigner: false, isWritable: true },
      ],
      data,
    });

    const payerKey = derivePayer(buyerPubkey);
    const txResult = await buildVersionedTransaction([programIx], payerKey);

    logAction({
      reqId,
      action: "actions.release",
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

  async refund(input: RefundActionInput, options?: ServiceOptions): Promise<ActionResponse> {
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

    const sellerPubkey = new PublicKey(input.sellerWallet);
    const { publicKey: escrowPda } = getEscrowPda({
      seller: deal.sellerWallet,
      buyer: deal.buyerWallet,
      mint: deal.depositTokenMint,
    });

    const data = Buffer.from(REFUND_DISCRIMINATOR);
    const programIx = new TransactionInstruction({
      programId: solanaConfig.programId,
      keys: [
        { pubkey: sellerPubkey, isSigner: true, isWritable: true },
        { pubkey: escrowPda, isSigner: false, isWritable: true },
      ],
      data,
    });

    const payerKey = derivePayer(sellerPubkey);
    const txResult = await buildVersionedTransaction([programIx], payerKey);

    logAction({
      reqId,
      action: "actions.refund",
      dealId: deal.id,
      wallet: input.sellerWallet,
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

  async confirm(input: ConfirmActionInput, options?: ServiceOptions) {
    const reqId = resolveReqId(options);
    const startedAt = Date.now();

    if (!isBase58Address(input.actorWallet)) {
      throw new Error("Invalid actor wallet");
    }

    const statusResp = await connection.getSignatureStatuses([input.txSig], { searchTransactionHistory: true });
    const signatureStatus = statusResp.value[0];
    if (!signatureStatus) throw new Error("Transaction not found");
    if (signatureStatus.err) throw new Error("Transaction failed");

    const slot = signatureStatus.slot ?? 0;

    const result = await prisma.$transaction(async (tx) => {
      const deal = await tx.deal.findUnique({ where: { id: input.dealId } });
      if (!deal) throw new Error("Deal not found");

      const expectedWallet =
        input.action === "FUND" || input.action === "RELEASE" ? deal.buyerWallet : deal.sellerWallet;
      if (expectedWallet !== input.actorWallet) throw new Error("Actor wallet mismatch");

      let nextStatus: DealStatus;
      switch (input.action) {
        case "FUND":
          if (deal.status !== DealStatus.INIT) throw new Error("Invalid transition");
          nextStatus = DealStatus.FUNDED;
          break;
        case "RELEASE":
          if (!(deal.status === DealStatus.FUNDED || deal.status === DealStatus.RESOLVED)) throw new Error("Invalid transition");
          nextStatus = DealStatus.RELEASED;
          break;
        case "REFUND":
          if (!(deal.status === DealStatus.FUNDED || deal.status === DealStatus.RESOLVED)) throw new Error("Invalid transition");
          nextStatus = DealStatus.REFUNDED;
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

  async dispute(): Promise<never> {
    throw new Error("Dispute handling moved to /actions endpoints");
  }
}

export const escrowService = new EscrowService();
