/**
 * User Route
 * Exposes POST /api/users to find or create a user by wallet address.
 * Exposes GET /api/users/me to get current user profile.
 * Exposes PATCH /api/users/me to update user profile (displayName).
 */
import express from "express";
import { createUserIfMissing } from "../services/user.service";
import { prisma } from "../lib/prisma";

const router = express.Router();

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
      walletAddress: user.walletAddress,
      displayName: user.displayName,
      emailAddress: user.emailAddress,
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

    const { displayName, emailAddress } = req.body ?? {};

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

    // Update user profile
    const user = await prisma.user.update({
      where: { id: session.userId },
      data: {
        ...(displayName !== undefined && { displayName: displayName.trim() || null }),
        ...(emailAddress !== undefined && { emailAddress: emailAddress?.trim() || null }),
        updatedAt: new Date(),
      },
    });

    return res.json({
      id: user.id,
      walletAddress: user.walletAddress,
      displayName: user.displayName,
      emailAddress: user.emailAddress,
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

export default router;

