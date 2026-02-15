/**
 * Keypair utilities for loading and managing cryptographic keys
 */
import { Keypair } from '@solana/web3.js';
import nacl from 'tweetnacl';

/**
 * Load the arbiter keypair from environment variable
 * @returns Solana Keypair for the arbiter, or null if not configured
 */
export function loadArbiterKeypair(): Keypair | null {
  const secretHex = process.env.ARBITER_ED25519_SECRET_HEX;

  if (!secretHex || secretHex.trim() === '') {
    console.warn('[keypair] ARBITER_ED25519_SECRET_HEX not configured. Auto-resolve will not work.');
    return null;
  }

  try {
    // The secret hex is a 32-byte seed
    const seed = Buffer.from(secretHex.trim(), 'hex');

    if (seed.length !== 32) {
      throw new Error(`Invalid seed length: expected 32 bytes, got ${seed.length}`);
    }

    // Generate the full keypair from the seed using nacl
    const naclKeypair = nacl.sign.keyPair.fromSeed(seed);

    // Convert to Solana Keypair format (64-byte secret key = seed + public key)
    const secretKey = new Uint8Array(64);
    secretKey.set(naclKeypair.secretKey);

    return Keypair.fromSecretKey(secretKey);
  } catch (error) {
    console.error('[keypair] Failed to load arbiter keypair:', error);
    throw new Error(`Failed to load arbiter keypair: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Get the arbiter's public key as a base58 string
 * @returns Public key string, or null if keypair not configured
 */
export function getArbiterPublicKey(): string | null {
  const keypair = loadArbiterKeypair();
  return keypair ? keypair.publicKey.toBase58() : null;
}
