/**
 * User Route
 * Exposes POST /api/users to find or create a user by wallet address.
 * Exposes GET /api/users/me to get current user profile.
 * Exposes PATCH /api/users/me to update user profile (displayName).
 */
import express from "express";
import crypto from "crypto";
import { createUserIfMissing } from "../services/user.service";
import { prisma } from "../lib/prisma";

/** Build a Gravatar URL from an email address. */
function gravatarUrl(email: string, size = 200): string {
  const hash = crypto.createHash("md5").update(email.trim().toLowerCase()).digest("hex");
  return `https://www.gravatar.com/avatar/${hash}?s=${size}&d=404`;
}

/** Suggest a display name from the local part of an email address. */
function suggestNameFromEmail(email: string): string {
  const local = email.split("@")[0] || "";
  return local
    .replace(/[._-]+/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .trim();
}

const router = express.Router();

// GET /api/users/email-lookup?email=xxx — returns suggested avatar URL + display name
router.get("/email-lookup", async (req, res) => {
  const email = typeof req.query.email === "string" ? req.query.email.trim() : "";
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ error: "Valid email is required" });
  }

  const avatarUrl = gravatarUrl(email);
  const suggestedName = suggestNameFromEmail(email);

  return res.json({ avatarUrl, suggestedName });
});

router.post("/", async (req, res) => {
  const { walletAddress } = req.body ?? {};
  if (typeof walletAddress !== "string" || walletAddress.length === 0) {
    return res.status(400).json({ error: "walletAddress is required" });
  }
  try {
    const user = await createUserIfMissing(walletAddress);
    return res.json(user);
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error("/api/users error", e);
    return res.status(500).json({
      error: "Internal Server Error",
      details: e instanceof Error ? e.message : String(e)
    });
  }
});

// GET /api/users/me - Get current user profile
router.get("/me", async (req, res) => {
  const sessionId = req.cookies['artha_session'];
  
  if (!sessionId) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    // Get session from database
    const session = await prisma.session.findUnique({
      where: { sessionId },
      include: { user: true }
    });

    if (!session || !session.user) {
      return res.status(401).json({ error: 'Invalid session' });
    }

    const user = session.user;

    return res.json({
      id: user.id,
      walletAddress: user.walletPublicKey || user.walletAddress,
      displayName: user.displayName,
      emailAddress: user.emailAddress,
      avatarUrl: user.avatarUrl,
      reputationScore: user.reputationScore.toString(),
      kycLevel: user.kycLevel,
      createdAt: user.createdAt.toISOString(),
      updatedAt: user.updatedAt.toISOString(),
    });
  } catch (error) {
    console.error('GET /api/users/me error:', error);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
});

// PATCH /api/users/me - Update user profile
router.patch("/me", async (req, res) => {
  const sessionId = req.cookies['artha_session'];
  
  if (!sessionId) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    // Get session from database
    const session = await prisma.session.findUnique({
      where: { sessionId },
      include: { user: true }
    });

    if (!session || !session.userId) {
      return res.status(401).json({ error: 'Invalid session' });
    }

    const { displayName, emailAddress, avatarUrl } = req.body ?? {};

    // Validate displayName if provided
    if (displayName !== undefined) {
      if (typeof displayName !== 'string') {
        return res.status(400).json({ error: 'displayName must be a string' });
      }
      if (displayName.length > 100) {
        return res.status(400).json({ error: 'displayName must be 100 characters or less' });
      }
    }

    // Validate emailAddress if provided
    if (emailAddress !== undefined) {
      if (emailAddress !== null && typeof emailAddress !== 'string') {
        return res.status(400).json({ error: 'emailAddress must be a string or null' });
      }
      if (emailAddress && emailAddress.trim()) {
        // Basic email validation
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(emailAddress.trim())) {
          return res.status(400).json({ error: 'Invalid email address format' });
        }
      }
    }

    // Validate avatarUrl if provided
    if (avatarUrl !== undefined && avatarUrl !== null && typeof avatarUrl !== 'string') {
      return res.status(400).json({ error: 'avatarUrl must be a string or null' });
    }

    // Update user profile
    const user = await prisma.user.update({
      where: { id: session.userId },
      data: {
        ...(displayName !== undefined && { displayName: displayName.trim() || null }),
        ...(emailAddress !== undefined && { emailAddress: emailAddress?.trim() || null }),
        ...(avatarUrl !== undefined && { avatarUrl: avatarUrl || null }),
        updatedAt: new Date(),
      },
    });

    return res.json({
      id: user.id,
      walletAddress: user.walletPublicKey || user.walletAddress,
      displayName: user.displayName,
      emailAddress: user.emailAddress,
      avatarUrl: user.avatarUrl,
      reputationScore: user.reputationScore.toString(),
      kycLevel: user.kycLevel,
      updatedAt: user.updatedAt.toISOString(),
    });
  } catch (error) {
    console.error('PATCH /api/users/me error:', error);
    if (error instanceof Error) {
      if (error.message.includes('Record to update not found')) {
        return res.status(404).json({ error: 'User not found' });
      }
      // Log the actual error for debugging
      console.error('Error details:', error.message, error.stack);
    }
    return res.status(500).json({ error: 'Internal Server Error' });
  }
});

// GET /api/users/:wallet/reputation - Calculate reputation score for a wallet
router.get("/:wallet/reputation", async (req, res) => {
  const { wallet } = req.params;

  try {
    const user = await prisma.user.findUnique({
      where: { walletAddress: wallet },
      select: { id: true, reputationScore: true },
    });

    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    // Count deals for this user
    const [releasedAsSeller, releasedAsBuyer, disputeWins, disputeLosses] = await Promise.all([
      prisma.deal.count({ where: { sellerId: user.id, status: "RELEASED" } }),
      prisma.deal.count({ where: { buyerId: user.id, status: "RELEASED" } }),
      // "Win" = deal resolved in your favour
      prisma.resolveTicket.count({
        where: {
          OR: [
            { finalAction: "RELEASE", deal: { sellerId: user.id } },
            { finalAction: "REFUND", deal: { buyerId: user.id } },
          ],
        },
      }),
      prisma.resolveTicket.count({
        where: {
          OR: [
            { finalAction: "REFUND", deal: { sellerId: user.id } },
            { finalAction: "RELEASE", deal: { buyerId: user.id } },
          ],
        },
      }),
    ]);

    const completedDeals = releasedAsSeller + releasedAsBuyer;
    const score = Math.min(
      100,
      Math.max(0, 50 + completedDeals * 10 + disputeWins * 5 - disputeLosses * 5)
    );

    // Update stored score
    await prisma.user.update({
      where: { id: user.id },
      data: { reputationScore: score },
    });

    return res.json({ wallet, score, completedDeals, disputeWins, disputeLosses });
  } catch (error) {
    console.error("GET /api/users/:wallet/reputation error:", error);
    return res.status(500).json({ error: "Internal Server Error" });
  }
});

export default router;

