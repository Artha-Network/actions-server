import { z } from "zod";
import { isBase58Address } from "../utils/validation";

const WalletSchema = z
  .string()
  .refine((value) => isBase58Address(value), { message: "Invalid wallet address" });

const amountString = z.union([z.string(), z.number()]).transform((value) => value.toString());

export const InitiateActionSchema = z.object({
  sellerWallet: WalletSchema,
  buyerWallet: WalletSchema,
  arbiterWallet: WalletSchema.optional(),
  amount: amountString,
  feeBps: z.number().int().min(0).max(10000),
  deliverBy: z.number().int().optional(),
  disputeDeadline: z.number().int().optional(),
  description: z.string().max(512).optional(),
  title: z.string().max(100).optional(),
  buyerEmail: z.string().email().optional().or(z.literal("")),
  sellerEmail: z.string().email().optional().or(z.literal("")),
  clientDealId: z.string().uuid().optional(),
  payer: WalletSchema,
});

export type InitiateActionInput = z.infer<typeof InitiateActionSchema>;

export const FundActionSchema = z.object({
  dealId: z.string().uuid(),
  buyerWallet: WalletSchema,
  amount: amountString,
});

export type FundActionInput = z.infer<typeof FundActionSchema>;

export const ReleaseActionSchema = z.object({
  dealId: z.string().uuid(),
  buyerWallet: WalletSchema,
});

export type ReleaseActionInput = z.infer<typeof ReleaseActionSchema>;

export const RefundActionSchema = z.object({
  dealId: z.string().uuid(),
  sellerWallet: WalletSchema,
});

export type RefundActionInput = z.infer<typeof RefundActionSchema>;

export const OpenDisputeActionSchema = z.object({
  dealId: z.string().uuid(),
  callerWallet: WalletSchema,
});

export type OpenDisputeActionInput = z.infer<typeof OpenDisputeActionSchema>;

export const ResolveActionSchema = z.object({
  dealId: z.string().uuid(),
  arbiterWallet: WalletSchema,
});

export type ResolveActionInput = z.infer<typeof ResolveActionSchema>;

export const ConfirmActionSchema = z.object({
  dealId: z.string().uuid(),
  txSig: z.string().refine((v) => typeof v === "string" && v.length >= 32 && v.length <= 128, {
    message: "Invalid transaction signature",
  }),
  actorWallet: WalletSchema,
  action: z.enum(["INITIATE", "FUND", "RELEASE", "REFUND", "OPEN_DISPUTE", "RESOLVE"]),
});

export type ConfirmActionInput = z.infer<typeof ConfirmActionSchema>;

export const ResolveActionSchema = z.object({
  dealId: z.string().uuid(),
  verdict: z.enum(["RELEASE", "REFUND"]).optional(), // If omitted, derived from latest ResolveTicket
});

export type ResolveActionInput = z.infer<typeof ResolveActionSchema>;

export type ActionResponse = {
  dealId: string;
  txMessageBase64?: string;
  verificationMessage?: string;
  nextClientAction?: string;
  latestBlockhash?: string;
  lastValidBlockHeight?: number;
  feePayer?: string;
};
