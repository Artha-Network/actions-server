import { TransactionInstruction, TransactionMessage, VersionedTransaction, PublicKey } from "@solana/web3.js";
import { connection, rpcManager } from "../config/solana";
import { withRpcRetry } from "../utils/rpc-retry";

export interface BuildTransactionResult {
  txMessageBase64: string;
  latestBlockhash: string;
  lastValidBlockHeight: number;
}

export async function buildVersionedTransaction(
  instructions: TransactionInstruction[],
  payerKey: PublicKey
): Promise<BuildTransactionResult> {
  const { blockhash, lastValidBlockHeight } = await withRpcRetry(
    async (connection) => {
      return await connection.getLatestBlockhash("confirmed");
    },
    {
      endpointManager: rpcManager,
      onAttempt: ({ endpoint, attempt, err }) => {
        if (err) {
          console.warn(`[RPC Retry] Attempt ${attempt} failed on ${endpoint}: ${err.message ?? err}`);
        } else {
          console.debug(`[RPC Retry] Attempt ${attempt} succeeded on ${endpoint}`);
        }
      },
    }
  );

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
