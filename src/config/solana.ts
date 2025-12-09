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

// Default program ID (matches deployed program)
const DEFAULT_PROGRAM_ID = "B1a1oejNg8uWz7USuuFSqmRQRUSZ95kk2e4PzRZ7Uti4";

const PROGRAM_ID_RAW = process.env.PROGRAM_ID ?? process.env.NEXT_PUBLIC_PROGRAM_ID ?? DEFAULT_PROGRAM_ID;
const USDC_MINT_RAW = process.env.USDC_MINT ?? process.env.NEXT_PUBLIC_USDC_MINT;

// Helper to safely parse keys
function parseKey(raw: string | undefined, name: string, fallback?: string) {
  if (!raw) {
    if (fallback) {
      console.warn(`[config] ${name} is missing, using fallback: ${fallback}`);
      try {
        return new PublicKey(fallback);
      } catch (e) {
        console.error(`[config] Fallback ${name} invalid: ${e}`);
        throw e;
      }
    }
    console.warn(`[config] ${name} is missing, using fallback.`);
    return null;
  }
  try {
    const trimmed = raw.trim().replace(/['"]/g, ""); // Remove quotes if they ended up in the string
    return new PublicKey(trimmed);
  } catch (e) {
    console.error(`[config] ${name} invalid: '${raw}' (len: ${raw.length}) - ${e}`);
    // If env is bad, try hardcoded fallback as last resort
    console.warn(`[config] No fallback for ${name}, re-throwing.`);
    throw e;
  }
}

const PROGRAM_ID = parseKey(PROGRAM_ID_RAW, 'PROGRAM_ID', DEFAULT_PROGRAM_ID)!;
const USDC_MINT = parseKey(USDC_MINT_RAW, 'USDC_MINT')!;

// Log program ID on module load for debugging
if (process.env.NODE_ENV !== 'test') {
  console.log(`[config] Program ID: ${PROGRAM_ID.toBase58()}`);
  if (PROGRAM_ID_RAW !== DEFAULT_PROGRAM_ID) {
    console.log(`[config] Program ID source: Environment variable (${PROGRAM_ID_RAW === process.env.PROGRAM_ID ? 'PROGRAM_ID' : 'NEXT_PUBLIC_PROGRAM_ID'})`);
  } else {
    console.log(`[config] Program ID source: DEFAULT_PROGRAM_ID (code)`);
  }
}

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
