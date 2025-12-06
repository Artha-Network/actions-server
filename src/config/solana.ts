/**
 * Solana configuration helpers.
 */
import { clusterApiUrl, Connection, PublicKey } from "@solana/web3.js";

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

const PROGRAM_ID_RAW = process.env.PROGRAM_ID ?? process.env.NEXT_PUBLIC_PROGRAM_ID;
const USDC_MINT_RAW = process.env.USDC_MINT ?? process.env.NEXT_PUBLIC_USDC_MINT;

if (!PROGRAM_ID_RAW) throw new Error("Missing PROGRAM_ID environment variable");
if (!USDC_MINT_RAW) throw new Error("Missing USDC_MINT environment variable");

export const PROGRAM_ID = new PublicKey(PROGRAM_ID_RAW);
export const USDC_MINT = new PublicKey(USDC_MINT_RAW);

const FEATURE_SPONSORED_FEES = process.env.FEATURE_SPONSORED_FEES === "true";
const FEE_PAYER_PUBKEY = process.env.FEE_PAYER_PUBKEY ?? null;

export const FEE_PAYER = FEATURE_SPONSORED_FEES && FEE_PAYER_PUBKEY ? new PublicKey(FEE_PAYER_PUBKEY) : null;

export const connection = new Connection(RPC_URL, "confirmed");

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
