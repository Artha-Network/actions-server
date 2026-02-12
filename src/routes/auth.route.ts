/**
 * Auth Route - Recommended Architecture Implementation
 * Handles wallet-based authentication with stateful sessions
 */
import express, { Request, Response } from "express";
import nacl from 'tweetnacl';
import { PublicKey } from '@solana/web3.js';
import { decode } from 'bs58';
import { prisma } from '../lib/prisma';
import { upsertWalletIdentity, WalletNetwork } from "../services/user.service";
import { isBase58Address } from "../utils/validation";
import { randomBytes } from 'crypto';

const router = express.Router();

// Configuration
const SESSION_TTL_HOURS = 24; // Session lifetime
const INACTIVITY_WINDOW_MINUTES = 30; // Inactivity timeout
const APP_NAME = 'Artha Network';

const isSupportedNetwork = (network: unknown): network is WalletNetwork =>
  network === "devnet" || network === "testnet" || network === "localnet";

// Helper: Generate session ID
function generateSessionId(): string {
  return randomBytes(32).toString('hex');
}

// Helper: Create canonical message
function createCanonicalMessage(nonce: string, timestamp: number): string {
  return JSON.stringify({
    app: APP_NAME,
    action: "session_confirm",
    nonce,
    ts: timestamp
  });
}

// Helper: Check if session is active
function isSessionActive(session: { expiresAt: Date; lastSeen: Date }): boolean {
  const now = new Date();
  const inactivityWindow = new Date(now.getTime() - INACTIVITY_WINDOW_MINUTES * 60 * 1000);
  
  return (
    now < session.expiresAt &&
    session.lastSeen >= inactivityWindow
  );
}

// Helper: Get client info from request
function getClientInfo(req: Request): { ip: string | undefined; userAgent: string | undefined } {
  return {
    ip: req.ip || req.socket.remoteAddress || undefined,
    userAgent: req.get('user-agent') || undefined
  };
}

/**
 * POST /auth/sign-in
 * Wallet-based sign-in with canonical message format
 * Body: { pubkey, message, signature }
 */
router.post("/sign-in", async (req: Request, res: Response) => {
  try {
    const { pubkey, message, signature } = req.body;

    if (!pubkey || !message || !signature) {
      return res.status(400).json({ error: 'Missing required fields: pubkey, message, signature' });
    }

    // Validate pubkey format
    let publicKey: PublicKey;
    try {
      publicKey = new PublicKey(pubkey);
    } catch (error) {
      return res.status(400).json({ error: 'Invalid wallet address format' });
    }

    // Parse and validate message structure
    let messageData: { app?: string; action?: string; nonce?: string; ts?: number };
    try {
      messageData = JSON.parse(message);
    } catch (error) {
      return res.status(400).json({ error: 'Invalid message format' });
    }

    // Validate canonical message structure
    if (messageData.app !== APP_NAME || 
        messageData.action !== 'session_confirm' ||
        !messageData.nonce ||
        !messageData.ts) {
      return res.status(400).json({ error: 'Invalid message structure. Expected: {app, action: "session_confirm", nonce, ts}' });
    }

    // Verify message is recent (within 5 minutes)
    const messageAge = Date.now() - messageData.ts;
    if (messageAge > 5 * 60 * 1000 || messageAge < 0) {
      return res.status(400).json({ error: 'Message timestamp is too old or invalid' });
    }

    // Verify signature
    const messageBytes = new TextEncoder().encode(message);
    const signatureBytes = new Uint8Array(signature);
    const publicKeyBytes = decode(pubkey);

    const verified = nacl.sign.detached.verify(messageBytes, signatureBytes, publicKeyBytes);
    if (!verified) {
      return res.status(401).json({ error: 'Invalid signature' });
    }

    // Get or create user
    const walletAddress = pubkey;
    let user = await prisma.user.findUnique({
      where: { walletAddress }
    });

    if (!user) {
      // Create new user
      user = await prisma.user.create({
        data: {
          walletAddress,
          walletPublicKey: pubkey,
          network: 'DEVNET' // Default, can be made configurable
        }
      });
    }

    // Create session
    const sessionId = generateSessionId();
    const now = new Date();
    const expiresAt = new Date(now.getTime() + SESSION_TTL_HOURS * 60 * 60 * 1000);
    const { ip, userAgent } = getClientInfo(req);

    const session = await prisma.session.create({
      data: {
        sessionId,
        userId: user.id,
        walletAddress: walletAddress,
        createdAt: now,
        lastSeen: now,
        expiresAt,
        ip,
        userAgent,
        deviceLabel: userAgent ? userAgent.substring(0, 100) : undefined
      }
    });

    // Set secure cookie
    res.cookie('artha_session', sessionId, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: SESSION_TTL_HOURS * 60 * 60 * 1000
    });

    return res.json({
      session: {
        id: session.id,
        sessionId: session.sessionId,
        expiresAt: session.expiresAt
      },
      user: {
        id: user.id,
        walletAddress: user.walletAddress,
        displayName: user.displayName,
        emailAddress: user.emailAddress
      }
    });

  } catch (error) {
    console.error('POST /auth/sign-in error:', error);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
});

/**
 * GET /auth/me
 * Get current session and user info
 */
router.get("/me", async (req: Request, res: Response) => {
  const sessionId = req.cookies['artha_session'];

  if (!sessionId) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const session = await prisma.session.findUnique({
      where: { sessionId },
      include: { user: true }
    });

    if (!session) {
      res.clearCookie('artha_session');
      return res.status(401).json({ error: 'Session not found' });
    }

    // Check if session is active
    if (!isSessionActive(session)) {
      // Delete expired/inactive session
      await prisma.session.delete({ where: { id: session.id } });
      res.clearCookie('artha_session');
      return res.status(401).json({ error: 'Session expired or inactive' });
    }

    // Update last_seen
    await prisma.session.update({
      where: { id: session.id },
      data: { lastSeen: new Date() }
    });

    const user = session.user;
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Check if profile is complete (has both displayName and emailAddress)
    const profileComplete = !!(user.displayName && user.emailAddress);
    // User is "new" if profile is incomplete (needs setup)
    const isNewUser = !profileComplete;

    return res.json({
      session: {
        id: session.id,
        sessionId: session.sessionId,
        expiresAt: session.expiresAt,
        lastSeen: session.lastSeen
      },
      user: {
        id: user.id,
        walletAddress: user.walletAddress,
        displayName: user.displayName,
        emailAddress: user.emailAddress,
        reputationScore: user.reputationScore.toString(),
        profileComplete,
        isNewUser
      }
    });

  } catch (error) {
    console.error('GET /auth/me error:', error);
    res.clearCookie('artha_session');
    return res.status(500).json({ error: 'Internal Server Error' });
  }
});

/**
 * POST /auth/keepalive
 * Heartbeat endpoint to update last_seen
 */
router.post("/keepalive", async (req: Request, res: Response) => {
  const sessionId = req.cookies['artha_session'];

  if (!sessionId) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const session = await prisma.session.findUnique({
      where: { sessionId }
    });

    if (!session) {
      res.clearCookie('artha_session');
      return res.status(401).json({ error: 'Session not found' });
    }

    // Check if session is still valid
    if (!isSessionActive(session)) {
      await prisma.session.delete({ where: { id: session.id } });
      res.clearCookie('artha_session');
      return res.status(401).json({ error: 'Session expired or inactive' });
    }

    // Update last_seen
    await prisma.session.update({
      where: { id: session.id },
      data: { lastSeen: new Date() }
    });

    return res.json({ success: true, lastSeen: new Date() });

  } catch (error) {
    console.error('POST /auth/keepalive error:', error);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
});

/**
 * DELETE /auth/session/:id
 * Revoke a specific session
 */
router.delete("/session/:id", async (req: Request, res: Response) => {
  const { id } = req.params;
  const sessionId = req.cookies['artha_session'];

  if (!sessionId) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    // Verify the session making the request
    const currentSession = await prisma.session.findUnique({
      where: { sessionId },
      include: { user: true }
    });

    if (!currentSession) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    // Find the session to revoke
    const sessionToRevoke = await prisma.session.findUnique({
      where: { id }
    });

    if (!sessionToRevoke) {
      return res.status(404).json({ error: 'Session not found' });
    }

    // Check if user owns this session or is an admin
    if (sessionToRevoke.userId !== currentSession.userId) {
      return res.status(403).json({ error: 'Forbidden: Cannot revoke other user\'s session' });
    }

    // Delete the session
    await prisma.session.delete({ where: { id } });

    // If revoking current session, clear cookie
    if (sessionToRevoke.sessionId === sessionId) {
      res.clearCookie('artha_session');
    }

    return res.json({ success: true });

  } catch (error) {
    console.error('DELETE /auth/session/:id error:', error);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
});

/**
 * GET /auth/sessions
 * List all sessions for current user
 */
router.get("/sessions", async (req: Request, res: Response) => {
  const sessionId = req.cookies['artha_session'];

  if (!sessionId) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const currentSession = await prisma.session.findUnique({
      where: { sessionId },
      include: { user: true }
    });

    if (!currentSession || !currentSession.userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    // Get all active sessions for this user
    const sessions = await prisma.session.findMany({
      where: { userId: currentSession.userId },
      orderBy: { lastSeen: 'desc' },
      select: {
        id: true,
        sessionId: true,
        createdAt: true,
        lastSeen: true,
        expiresAt: true,
        ip: true,
        userAgent: true,
        deviceLabel: true
      }
    });

    // Filter to only active sessions
    const activeSessions = sessions.filter(s => isSessionActive(s));

    return res.json({ sessions: activeSessions });

  } catch (error) {
    console.error('GET /auth/sessions error:', error);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
});

/**
 * POST /auth/logout
 * Logout current session
 */
router.post("/logout", async (req: Request, res: Response) => {
  const sessionId = req.cookies['artha_session'];

  if (sessionId) {
    try {
      await prisma.session.deleteMany({
        where: { sessionId }
      });
    } catch (error) {
      console.error('Error deleting session on logout:', error);
    }
  }

  res.clearCookie('artha_session');
  return res.json({ success: true });
});

// Legacy endpoint - keep for backward compatibility
router.post("/upsert-wallet", async (req, res) => {
  const { walletAddress, network } = req.body ?? {};

  if (!isBase58Address(walletAddress)) {
    return res.status(400).json({ error: "Invalid walletAddress" });
  }

  if (!isSupportedNetwork(network)) {
    return res.status(400).json({ error: "Unsupported network" });
  }

  try {
    const result = await upsertWalletIdentity(walletAddress, network);
    return res.json(result);
  } catch (error) {
    console.error("/auth/upsert-wallet error", error);
    return res.status(500).json({ error: "Internal Server Error" });
  }
});

export default router;
