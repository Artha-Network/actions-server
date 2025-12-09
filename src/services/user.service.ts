/**
 * User Service
 * User CRUD helpers using Prisma.
 */
import { prisma } from "../lib/prisma";

export type WalletNetwork = "devnet" | "testnet" | "localnet";

export const createUserIfMissing = async (walletAddress: string) => {
  // Check if user exists
  const existingUser = await prisma.user.findUnique({
    where: { walletAddress },
  });

  if (existingUser) {
    return {
      id: existingUser.id,
      walletAddress: existingUser.walletAddress,
      walletPublicKey: existingUser.walletPublicKey,
      displayName: existingUser.displayName,
      emailAddress: existingUser.emailAddress,
      reputationScore: existingUser.reputationScore.toString(),
      kycLevel: existingUser.kycLevel,
      createdAt: existingUser.createdAt.toISOString(),
      updatedAt: existingUser.updatedAt.toISOString(),
    };
  }

  // User doesn't exist - create minimal user record
  const newUser = await prisma.user.create({
    data: {
      walletAddress,
      walletPublicKey: walletAddress,
      lastSeenAt: new Date(),
    },
  });

  return {
    id: newUser.id,
    walletAddress: newUser.walletAddress,
    walletPublicKey: newUser.walletPublicKey,
    displayName: newUser.displayName,
    emailAddress: newUser.emailAddress,
    reputationScore: newUser.reputationScore.toString(),
    kycLevel: newUser.kycLevel,
    createdAt: newUser.createdAt.toISOString(),
    updatedAt: newUser.updatedAt.toISOString(),
  };
};

export const upsertWalletIdentity = async (walletAddress: string, network: string) => {
  // Find existing user - users should be created when they set up their profile
  // Don't auto-create users during deal creation
  const existingUser = await prisma.user.findUnique({
    where: { walletAddress },
    select: { id: true },
  });

  if (!existingUser) {
    // User doesn't exist - they need to set up their profile first
    throw new Error(
      `User with wallet ${walletAddress} does not exist. Please set up your profile first before creating deals.`
    );
  }

  return {
    userId: existingUser.id,
    walletAddress,
    network: network === 'testnet' ? 'testnet' : 'devnet',
    lastSeenAt: new Date(),
  };
};
