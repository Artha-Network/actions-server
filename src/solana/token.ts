import { ASSOCIATED_TOKEN_PROGRAM_ID, createAssociatedTokenAccountIdempotentInstruction, getAssociatedTokenAddressSync, TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { PublicKey } from "@solana/web3.js";

export function deriveAta(mint: PublicKey, owner: PublicKey, allowOffCurve = false) {
  return getAssociatedTokenAddressSync(mint, owner, allowOffCurve, TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID);
}

export function buildIdempotentCreateAtaIx(payer: PublicKey, owner: PublicKey, mint: PublicKey, allowOffCurve = false) {
  const ata = deriveAta(mint, owner, allowOffCurve);
  return {
    ata,
    instruction: createAssociatedTokenAccountIdempotentInstruction(
      payer,
      ata,
      owner,
      mint,
      TOKEN_PROGRAM_ID,
      ASSOCIATED_TOKEN_PROGRAM_ID,
    ),
  };
}
