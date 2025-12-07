/**
 * Solana configuration helpers.
 */
import { clusterApiUrl, Connection, PublicKey } from "@solana/web3.js";
import { RpcEndpointManager } from "../utils/rpc-endpoint-manager";

type SolanaCluster = "devnet" | "testnet" | "mainnet-beta" | "localnet" | "localhost";

const CLUSTER_ENV =
  process.env.NEXT_PUBLIC_SOLANA_CLUSTER ??
  process.env.SOLANA_CLUSTER ??
  process.env.CLUSTER ??
  "localnet";

const normalizedCluster = CLUSTER_ENV.toLowerCase();
const SOLANA_CLUSTER: SolanaCluster =
  normalizedCluster === "testnet" ? "testnet" :
    normalizedCluster === "mainnet-beta" ? "mainnet-beta" :
      normalizedCluster === "localnet" || normalizedCluster === "localhost" ? "localnet" :
        "devnet";

// Use custom RPC for localnet, otherwise use default cluster API
const DEFAULT_RPC_URL = SOLANA_CLUSTER === "localnet"
  ? "http://127.0.0.1:8899"
  : clusterApiUrl(SOLANA_CLUSTER === "mainnet-beta" ? "mainnet-beta" : SOLANA_CLUSTER === "testnet" ? "testnet" : "devnet");

const RPC_URL = process.env.SOLANA_RPC_URL ?? DEFAULT_RPC_URL;
// Parse additional endpoints locally or from env
const rawEndpoints = process.env.RPC_ENDPOINTS ?? RPC_URL;
const urls = rawEndpoints.split(',').map((s) => s.trim()).filter(Boolean);

// Configurable thresholds (falls back to env defaults)
const CIRCUIT_THRESHOLD = Number(process.env.RPC_CIRCUIT_THRESHOLD) || 4;
const CIRCUIT_COOLDOWN_MS = Number(process.env.RPC_CIRCUIT_COOLDOWN_MS) || 60_000;

export const rpcManager = new RpcEndpointManager(urls, CIRCUIT_THRESHOLD, CIRCUIT_COOLDOWN_MS);

// Return a Connection for the current best endpoint
export function getConnection(): Connection {
  const url = rpcManager.pickEndpoint();
  // Provide helpful log for debugging (redact keys if present)
  // eslint-disable-next-line no-console
  console.debug(`[getConnection] using RPC ${redactUrl(url)}`);
  return new Connection(url, "confirmed");
}

function redactUrl(url: string) {
  try {
    const u = new URL(url);
    if (u.username || u.password) {
      u.password = 'REDACTED';
      u.username = 'REDACTED';
    }
    return u.toString();
  } catch {
    return url;
  }
}

const PROGRAM_ID_RAW = process.env.PROGRAM_ID ?? process.env.NEXT_PUBLIC_PROGRAM_ID;
const USDC_MINT_RAW = process.env.USDC_MINT ?? process.env.NEXT_PUBLIC_USDC_MINT;

// Helper to safely parse keys
function parseKey(raw: string | undefined, name: string) {
  if (!raw) {
    console.warn(`[config] ${name} is missing, using fallback.`);
    return null;
  }
  try {
    const trimmed = raw.trim().replace(/['"]/g, ""); // Remove quotes if they ended up in the string
    return new PublicKey(trimmed);
  } catch (e) {
    console.error(`[config] ${name} invalid: '${raw}' (len: ${raw.length}) - ${e}`);
    // If env is bad, try hardcoded fallback as last resort
    if (name === 'USDC_MINT') {
      console.log(`[config] Falling back to hardcoded Mint.`);
      return new PublicKey("HtwMqN2J68df7y9q8G1mLKbgfXJ6vEvBns7agrFHKHjQ");
    }
    if (name === 'PROGRAM_ID') {
      console.log(`[config] Falling back to hardcoded Program ID.`);
      return new PublicKey("HM1zYGd6WVH8e73U9QZW8spamWmLqzd391raEsfiNzEZ");
    }
    console.warn(`[config] No fallback for ${name}, re-throwing.`);
    throw e;
  }
}

// Fallbacks if env is missing
const DEFAULT_PROGRAM_ID = "HM1zYGd6WVH8e73U9QZW8spamWmLqzd391raEsfiNzEZ";
const DEFAULT_USDC_MINT = "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU";

const PROGRAM_ID = parseKey(PROGRAM_ID_RAW ?? DEFAULT_PROGRAM_ID, 'PROGRAM_ID')!;
const USDC_MINT = parseKey(USDC_MINT_RAW ?? DEFAULT_USDC_MINT, 'USDC_MINT')!;

export { PROGRAM_ID, USDC_MINT };

const FEATURE_SPONSORED_FEES = process.env.FEATURE_SPONSORED_FEES === "true";
const FEE_PAYER_PUBKEY = process.env.FEE_PAYER_PUBKEY ?? null;

export const FEE_PAYER = FEATURE_SPONSORED_FEES && FEE_PAYER_PUBKEY ? new PublicKey(FEE_PAYER_PUBKEY) : null;

// Export default connection for backward compatibility (lazy loaded best endpoint)
export const connection = getConnection();

export const solanaConfig = {
  cluster: SOLANA_CLUSTER,
  rpcUrl: RPC_URL,
  programId: PROGRAM_ID,
  usdcMint: USDC_MINT,
  sponsoredFees: FEATURE_SPONSORED_FEES,
  feePayer: FEE_PAYER,
  usdcDecimals: 6,
} as const;

export type SolanaConfig = typeof solanaConfig;
