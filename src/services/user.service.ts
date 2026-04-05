/**
 * User Service
 * User CRUD helpers using Prisma.
 */
import { prisma } from "../lib/prisma";

export type WalletNetwork = "devnet" | "testnet" | "localnet";

export const createUserIfMissing = async (walletAddress: string) => {
  // Check both unique fields (walletAddress and walletPublicKey can diverge for legacy records)
  let user = await prisma.user.findFirst({
    where: {
      OR: [
        { walletAddress },
        { walletPublicKey: walletAddress },
      ],
    },
  });

  if (!user) {
    try {
      user = await prisma.user.create({
        data: {
          walletAddress,
          walletPublicKey: walletAddress,
          lastSeenAt: new Date(),
        },
      });
    } catch (e: any) {
      // Race condition: another request created the user between find and create
      if (e.code === 'P2002') {
        user = await prisma.user.findFirst({
          where: {
            OR: [
              { walletAddress },
              { walletPublicKey: walletAddress },
            ],
          },
        });
        if (!user) throw e;
      } else {
        throw e;
      }
    }
  }

  return {
    id: user.id,
    walletAddress: user.walletAddress,
    walletPublicKey: user.walletPublicKey,
    displayName: user.displayName,
    emailAddress: user.emailAddress,
    reputationScore: user.reputationScore.toString(),
    kycLevel: user.kycLevel,
    createdAt: user.createdAt.toISOString(),
    updatedAt: user.updatedAt.toISOString(),
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
