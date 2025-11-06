/**
 * User Service
 * Provides functions to manage users in the database using Prisma.
 */
import { PrismaClient, SolanaNetwork } from "@prisma/client";

const prisma = new PrismaClient();

export type WalletNetwork = "devnet" | "testnet";

const toSolanaNetwork = (network: WalletNetwork): SolanaNetwork =>
  network === "testnet" ? SolanaNetwork.TESTNET : SolanaNetwork.DEVNET;

const now = () => new Date();

/**
 * findOrCreateUser
 * Idempotently returns a user by wallet address; creates one if it does not exist.
 */
export const findOrCreateUser = async (walletAddress: string) => {
  const solanaNetwork = SolanaNetwork.DEVNET;
  const timestamp = now();

  return prisma.user.upsert({
    where: { walletAddress },
    create: {
      walletAddress,
      walletPublicKey: walletAddress,
      network: solanaNetwork,
      lastSeenAt: timestamp,
    },
    update: {
      walletPublicKey: walletAddress,
      lastSeenAt: timestamp,
      updatedAt: timestamp,
    },
  });
};

/**
 * upsertWalletIdentity
 * Upserts a user record keyed by walletAddress and maintains identity metadata.
 */
export const upsertWalletIdentity = async (walletAddress: string, network: WalletNetwork) => {
  const solanaNetwork = toSolanaNetwork(network);
  const timestamp = now();

  const user = await prisma.user.upsert({
    where: { walletAddress },
    create: {
      walletAddress,
      walletPublicKey: walletAddress,
      network: solanaNetwork,
      lastSeenAt: timestamp,
    },
    update: {
      walletPublicKey: walletAddress,
      network: solanaNetwork,
      lastSeenAt: timestamp,
      updatedAt: timestamp,
    },
    select: {
      id: true,
      walletAddress: true,
      network: true,
      lastSeenAt: true,
    },
  });

  return {
    userId: user.id,
    walletAddress: user.walletAddress,
    network,
    lastSeenAt: user.lastSeenAt,
  };
};

// Named exports only per coding convention
