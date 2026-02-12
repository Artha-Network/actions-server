import { TransactionInstruction, TransactionMessage, VersionedTransaction, PublicKey, Keypair, SimulatedTransactionResponse } from "@solana/web3.js";
import { connection, rpcManager } from "../config/solana";
import { withRpcRetry } from "../utils/rpc-retry";

export interface BuildTransactionResult {
  txMessageBase64: string;
  latestBlockhash: string;
  lastValidBlockHeight: number;
}

export interface SignAndSendResult {
  txSig: string;
  latestBlockhash: string;
  lastValidBlockHeight: number;
}

export interface SimulateTransactionResult {
  simulation: SimulatedTransactionResponse | null;
  error: {
    message: string;
    logs: string[];
    err?: any;
  } | null;
}

/**
 * Build a versioned transaction with a fresh blockhash.
 * 
 * IMPORTANT: The returned transaction should be sent immediately.
 * If there's any delay between building and sending, the frontend
 * should refresh the blockhash using refreshTransactionBlockhash().
 * 
 * Best practice: Always fetch blockhash right before sending.
 * Never reuse a previously signed transaction.
 */
export async function buildVersionedTransaction(
  instructions: TransactionInstruction[],
  payerKey: PublicKey
): Promise<BuildTransactionResult> {
  // Always fetch fresh blockhash - use "finalized" for better reliability
  // "finalized" blockhashes stay valid longer than "confirmed"
  const { blockhash, lastValidBlockHeight } = await withRpcRetry(
    async (connection) => {
      return await connection.getLatestBlockhash("finalized");
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

/**
 * Build a versioned transaction, sign it with the given keypair, and send it.
 * Used for server-signed actions (e.g. arbiter resolve).
 */
export async function buildSignAndSendTransaction(
  instructions: TransactionInstruction[],
  signerKeypair: Keypair
): Promise<SignAndSendResult> {
  const { blockhash, lastValidBlockHeight } = await withRpcRetry(
    async (conn) => conn.getLatestBlockhash("finalized"),
    { endpointManager: rpcManager }
  );

  const message = new TransactionMessage({
    payerKey: signerKeypair.publicKey,
    recentBlockhash: blockhash,
    instructions,
  }).compileToV0Message();

  const transaction = new VersionedTransaction(message);
  transaction.sign([signerKeypair]);

  const txSig = await withRpcRetry(
    async (conn) => {
      const sig = await conn.sendTransaction(transaction, {
        skipPreflight: false,
        preflightCommitment: "confirmed",
        maxRetries: 3,
      });
      return sig;
    },
    { endpointManager: rpcManager }
  );

  return {
    txSig,
    latestBlockhash: blockhash,
    lastValidBlockHeight,
  };
}

/**
 * Refresh the blockhash on an existing transaction.
 * Use this if there's any delay between building and sending the transaction.
 * 
 * IMPORTANT: This rebuilds the transaction with a fresh blockhash.
 * The transaction will need to be re-signed after refreshing.
 * 
 * @param txMessageBase64 - The serialized transaction
 * @returns Updated transaction with fresh blockhash
 */
export async function refreshTransactionBlockhash(
  txMessageBase64: string
): Promise<BuildTransactionResult> {
  // Deserialize the transaction
  const transaction = VersionedTransaction.deserialize(Buffer.from(txMessageBase64, "base64"));
  
  // Get fresh blockhash
  const { blockhash, lastValidBlockHeight } = await withRpcRetry(
    async (connection) => {
      return await connection.getLatestBlockhash("finalized");
    },
    {
      endpointManager: rpcManager,
      onAttempt: ({ endpoint, attempt, err }) => {
        if (err) {
          console.warn(`[Refresh Blockhash] Attempt ${attempt} failed on ${endpoint}: ${err.message ?? err}`);
        }
      },
    }
  );

  // Extract instructions from the VersionedTransaction message
  const message = transaction.message;
  const instructions: TransactionInstruction[] = [];
  
  // Reconstruct instructions from compiled message
  for (const compiledIx of message.compiledInstructions) {
    const programId = message.staticAccountKeys[compiledIx.programIdIndex];
    
    // Reconstruct account keys with proper signer/writable flags
    const keys = compiledIx.accountKeyIndexes.map((accountIndex) => {
      const pubkey = message.staticAccountKeys[accountIndex];
      const isSigner = accountIndex < message.header.numRequiredSignatures;
      
      // Determine if writable based on header
      let isWritable = true;
      if (accountIndex < message.header.numRequiredSignatures) {
        // Signed accounts
        if (accountIndex >= message.header.numRequiredSignatures - message.header.numReadonlySignedAccounts) {
          isWritable = false;
        }
      } else {
        // Unsigned accounts
        const unsignedIndex = accountIndex - message.header.numRequiredSignatures;
        const totalUnsigned = message.staticAccountKeys.length - message.header.numRequiredSignatures;
        if (unsignedIndex >= totalUnsigned - message.header.numReadonlyUnsignedAccounts) {
          isWritable = false;
        }
      }
      
      return {
        pubkey,
        isSigner,
        isWritable,
      };
    });
    
    instructions.push(
      new TransactionInstruction({
        programId,
        keys,
        data: Buffer.from(compiledIx.data),
      })
    );
  }

  // Get fee payer (first signer)
  const payerKey = message.staticAccountKeys[0];

  // Rebuild the message with fresh blockhash
  const newMessage = new TransactionMessage({
    payerKey,
    recentBlockhash: blockhash,
    instructions,
  }).compileToV0Message();

  // Create new transaction with fresh blockhash
  const refreshedTransaction = new VersionedTransaction(newMessage);
  const serialized = refreshedTransaction.serialize();

  return {
    txMessageBase64: Buffer.from(serialized).toString("base64"),
    latestBlockhash: blockhash,
    lastValidBlockHeight,
  };
}

/**
 * Simulate a transaction and return full error details including logs
 */
export async function simulateVersionedTransaction(
  txMessageBase64: string,
  commitment: "processed" | "confirmed" | "finalized" = "confirmed"
): Promise<SimulateTransactionResult> {
  try {
    const transaction = VersionedTransaction.deserialize(Buffer.from(txMessageBase64, "base64"));
    
    const simulation = await withRpcRetry(
      async (connection) => {
        return await connection.simulateTransaction(transaction, {
          commitment,
          replaceRecentBlockhash: true, // Always use fresh blockhash
        });
      },
      {
        endpointManager: rpcManager,
        onAttempt: ({ endpoint, attempt, err }) => {
          if (err) {
            console.warn(`[Simulate Retry] Attempt ${attempt} failed on ${endpoint}: ${err.message ?? err}`);
          }
        },
      }
    );

    if (simulation.value.err) {
      return {
        simulation: null,
        error: {
          message: `Simulation failed: ${JSON.stringify(simulation.value.err)}`,
          logs: simulation.value.logs || [],
          err: simulation.value.err,
        },
      };
    }

    return {
      simulation: simulation.value,
      error: null,
    };
  } catch (err: any) {
    // Extract full error details
    const errorMessage = err?.message || String(err);
    let logs: string[] = [];
    
    // Try to extract logs from error object
    if (err?.logs && Array.isArray(err.logs)) {
      logs = err.logs;
    } else if (err?.response?.data?.result?.logs) {
      logs = err.response.data.result.logs;
    } else if (typeof err?.getLogs === "function") {
      try {
        logs = err.getLogs();
      } catch {
        // getLogs() might not be available
      }
    }

    // If we have a signature, try to fetch transaction details
    if (err?.signature) {
      try {
        const tx = await withRpcRetry(
          async (connection) => {
            return await connection.getTransaction(err.signature, {
              commitment: "confirmed",
              maxSupportedTransactionVersion: 0,
            });
          },
          {
            endpointManager: rpcManager,
            maxAttempts: 2,
          }
        );
        if (tx?.meta?.logMessages) {
          logs = tx.meta.logMessages;
        }
      } catch {
        // Ignore errors fetching transaction
      }
    }

    return {
      simulation: null,
      error: {
        message: errorMessage,
        logs,
        err,
      },
    };
  }
}
