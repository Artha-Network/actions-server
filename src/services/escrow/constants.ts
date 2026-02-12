import { getInstructionDiscriminator } from "../../solana/anchor";

export const INITIATE_DISCRIMINATOR = getInstructionDiscriminator("initiate");
export const FUND_DISCRIMINATOR = getInstructionDiscriminator("fund");
export const RELEASE_DISCRIMINATOR = getInstructionDiscriminator("release");
export const REFUND_DISCRIMINATOR = getInstructionDiscriminator("refund");
export const OPEN_DISPUTE_DISCRIMINATOR = getInstructionDiscriminator("open_dispute");
export const RESOLVE_DISCRIMINATOR = getInstructionDiscriminator("resolve");

