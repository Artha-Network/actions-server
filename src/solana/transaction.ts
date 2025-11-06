import { TransactionInstruction, TransactionMessage, VersionedTransaction, PublicKey } from "@solana/web3.js";
import { connection } from "../config/solana";

export interface BuildTransactionResult {
  txMessageBase64: string;
  latestBlockhash: string;
  lastValidBlockHeight: number;
}

export async function buildVersionedTransaction(
  instructions: TransactionInstruction[],
  payerKey: PublicKey
): Promise<BuildTransactionResult> {
  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash("confirmed");
  const message = new TransactionMessage({
    payerKey,
    recentBlockhash: blockhash,
    instructions,
  }).compileToV0Message();

  // Create the full VersionedTransaction and serialize it
  const transaction = new VersionedTransaction(message);
  const serialized = transaction.serialize();

  return {
    txMessageBase64: Buffer.from(serialized).toString("base64"),
    latestBlockhash: blockhash,
    lastValidBlockHeight,
  };
}
