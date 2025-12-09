
import { Router, Request, Response } from 'express';
import nacl from 'tweetnacl';
import { PublicKey } from '@solana/web3.js';
import { decode } from 'bs58';
import { prisma } from '../lib/prisma';

const router = Router();

// 1. Generate Challenge
router.post('/challenge', async (req: Request<{}, {}, ChallengeRequest>, res: Response) => {
    try {
        const { wallet } = req.body;
        if (!wallet) return res.status(400).json({ error: 'Wallet address required' });

        // Create a secure random challenge
        const challenge = `Artha Auth ${Date.now()}_${Math.random().toString(36).substring(7)}`;

        // Expire challenge after 5 minutes
        // Store in DB instead of memory
        await prisma.$executeRawUnsafe(`
            INSERT INTO auth_challenges (wallet_address, challenge, expires_at) 
            VALUES ($1, $2, NOW() + INTERVAL '5 minutes')
            ON CONFLICT (wallet_address) 
            DO UPDATE SET challenge = $2, expires_at = NOW() + INTERVAL '5 minutes'
        `, wallet, challenge);

        return res.json({ challenge });
    } catch (error) {
        console.error('Challenge error:', error);
        return res.status(500).json({ error: 'Internal Server Error' });
    }
});

// 2. Verify Signature & Set Cookie
router.post('/verify', async (req: Request<{}, {}, VerifyRequest>, res: Response) => {
    try {
        const { wallet, signature } = req.body;

        // Fetch challenge from DB
        const result = await prisma.$queryRawUnsafe<Array<{ challenge: string }>>(`
            SELECT challenge FROM auth_challenges 
            WHERE wallet_address = $1 AND expires_at > NOW()
        `, wallet);

        if (!result || result.length === 0) {
            return res.status(400).json({ error: 'Challenge not found or expired. Please retry.' });
        }

        const challenge = result[0].challenge;

        // Verify Signature
        // 1. Encode challenge message
        const messageBytes = new TextEncoder().encode(challenge);

        // 2. Decode signature/wallet
        const signatureBytes = new Uint8Array(signature);
        const publicKeyBytes = decode(wallet);

        // 3. Verify
        const verified = nacl.sign.detached.verify(messageBytes, signatureBytes, publicKeyBytes);

        if (!verified) {
            return res.status(401).json({ error: 'Invalid signature' });
        }

        // 4. Create Session (Simple signed object for now, or just trust the cookie existence)
        // ideally use jsonwebtoken here, but for MVP we set a simple signed cookie
        // For now, we store just the wallet in the cookie

        res.cookie('artha_session', JSON.stringify({ wallet }), {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'lax',
            maxAge: 24 * 60 * 60 * 1000 // 24 hours
        });

        // Clear used challenge
        await prisma.$executeRawUnsafe(`DELETE FROM auth_challenges WHERE wallet_address = $1`, wallet);

        return res.json({ user: { wallet, authenticated: true } });

    } catch (error) {
        console.error('Verify error:', error);
        return res.status(500).json({ error: 'Verification failed' });
    }
});

// 3. Get Current Session
router.get('/me', async (req: Request, res: Response) => {
    const session = req.cookies['artha_session'];

    if (!session) {
        return res.status(401).json({ error: 'Unauthorized' });
    }

    try {
        const sessionData = JSON.parse(session);
        const wallet = sessionData.wallet;

        if (!wallet) {
            return res.status(401).json({ error: 'Invalid session' });
        }

        // Fetch user profile from database
        const userProfile = await prisma.user.findUnique({
            where: { walletAddress: wallet },
            select: {
                id: true,
                walletAddress: true,
                displayName: true,
                emailAddress: true,
                reputationScore: true,
                createdAt: true,
            },
        });

        if (!userProfile) {
            // User doesn't exist in DB yet - this is a new user
            return res.json({ user: { wallet, authenticated: true, isNewUser: true, profileComplete: false } });
        }

        // User exists in DB - they have an account
        // Check if profile is complete (has displayName and emailAddress) for optional UI hints
        const profileComplete = !!(userProfile.displayName && userProfile.emailAddress);

        return res.json({
            user: {
                wallet: userProfile.walletAddress,
                id: userProfile.id,
                name: userProfile.displayName || undefined,
                displayName: userProfile.displayName || undefined,
                emailAddress: userProfile.emailAddress || undefined,
                reputationScore: userProfile.reputationScore.toString(),
                isNewUser: false, // User exists in DB, so not new
                profileComplete,
                authenticated: true,
            },
        });
    } catch (error) {
        console.error('Session /me error:', error);
        return res.status(401).json({ error: 'Invalid session' });
    }
});

// 4. Logout
router.post('/logout', (req: Request, res: Response) => {
    res.clearCookie('artha_session');
    res.json({ success: true });
});

export default router;
