/**
 * User Service
 * Provides functions to manage users in the database using Prisma.
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

/**
 * findOrCreateUser
 * Idempotently returns a user by wallet address; creates one if it does not exist.
 */
export const findOrCreateUser = async (walletAddress: string) => {
  let user = await prisma.user.findUnique({ where: { walletAddress } });
  if (!user) {
    user = await prisma.user.create({ data: { walletAddress } });
  }
  return user;
};

// Named exports only per coding convention
