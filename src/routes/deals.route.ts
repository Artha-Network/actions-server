import { Router } from 'express';
import { createUserIfMissing } from '../services/user.service';
import { prisma } from '../lib/prisma';

const router = Router();

// GET /api/deals - Get deals for a user
router.get('/', async (req, res) => {
  try {
    const {
      wallet_address,
      offset = 0,
      limit = 12,
      status
    } = req.query;

    if (!wallet_address || typeof wallet_address !== 'string') {
      return res.status(400).json({ error: 'wallet_address is required' });
    }

    // Check if user exists - don't auto-create, they should set up profile first
    const user = await prisma.user.findUnique({
      where: { walletAddress: wallet_address },
      select: { id: true },
    });

    if (!user) {
      // User doesn't exist - return empty deals list (they need to set up profile first)
      // Don't auto-create users here
    }

    let whereClause: any = {
      OR: [
        { buyerWallet: wallet_address },
        { sellerWallet: wallet_address }
      ]
    };

    if (status && typeof status === 'string') {
      whereClause.status = status;
    }

    const deals = await prisma.deal.findMany({
      where: whereClause,
      select: {
        id: true,
        title: true,
        buyerEmail: true, // This field exists in schema
        sellerEmail: true, // This field exists in schema
        status: true,
        priceUsd: true,
        buyerWallet: true,
        sellerWallet: true,
        deliverDeadline: true,
        createdAt: true,
        updatedAt: true
      },
      orderBy: { createdAt: 'desc' },
      skip: Number(offset),
      take: Number(limit)
    });

    // Map to snake_case for frontend compatibility
    const mappedDeals = deals.map(deal => ({
      id: deal.id,
      title: deal.title,
      buyer_email: deal.buyerEmail,
      seller_email: deal.sellerEmail,
      status: deal.status,
      price_usd: deal.priceUsd.toString(),
      buyer_wallet: deal.buyerWallet,
      seller_wallet: deal.sellerWallet,
      deliver_deadline: deal.deliverDeadline?.toISOString() || null,
      created_at: deal.createdAt.toISOString(),
      updated_at: deal.updatedAt.toISOString()
    }));

    const total = await prisma.deal.count({ where: whereClause });

    res.json({
      deals: mappedDeals || [],
      total: total || 0
    });
  } catch (error) {
    console.error('Failed to fetch deals:', error);
    res.status(500).json({ error: 'Failed to fetch deals' });
  }
});

// GET /api/deals/:id - Get specific deal
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const deal = await prisma.deal.findUnique({
      where: { id },
      include: {
        buyer: true,
        seller: true
      }
    });

    if (!deal) {
      return res.status(404).json({ error: 'Deal not found' });
    }

    res.json(deal);
  } catch (error) {
    console.error('Failed to fetch deal:', error);
    res.status(500).json({ error: 'Failed to fetch deal' });
  }
});

// GET /api/deals/events - Get recent deal events
router.get('/events/recent', async (req, res) => {
  try {
    const {
      wallet_address,
      limit = 6
    } = req.query;

    if (!wallet_address || typeof wallet_address !== 'string') {
      return res.status(400).json({ error: 'wallet_address is required' });
    }

    // Ensure user exists in database before querying events
    await createUserIfMissing(wallet_address);

    // Get deals for this wallet first
    const userDeals = await prisma.deal.findMany({
      where: {
        OR: [
          { buyerWallet: wallet_address },
          { sellerWallet: wallet_address }
        ]
      },
      select: { id: true }
    });

    const dealIds = userDeals.map(deal => deal.id);

    if (dealIds.length === 0) {
      return res.json([]);
    }

    // Get recent events for these deals
    const events = await prisma.onchainEvent.findMany({
      where: {
        dealId: { in: dealIds }
      },
      select: {
        id: true,
        dealId: true,
        txSig: true,
        instruction: true,
        createdAt: true,
        deal: {
          select: {
            buyerWallet: true,
            sellerWallet: true
          }
        }
      },
      orderBy: { createdAt: 'desc' },
      take: Number(limit)
    });

    res.json(events || []);
  } catch (error) {
    console.error('Failed to fetch deal events:', error);
    res.status(500).json({ error: 'Failed to fetch deal events' });
  }
});

// ============================================================
// Evidence endpoints (Sprint 4)
// ============================================================

// POST /api/deals/:id/evidence - Submit evidence for a disputed deal
router.post('/:id/evidence', async (req, res) => {
  try {
    const { id: dealId } = req.params;
    const { description, type, wallet_address } = req.body;

    // Validate required fields
    if (!description || typeof description !== 'string') {
      return res.status(400).json({ error: 'description is required' });
    }
    if (!wallet_address || typeof wallet_address !== 'string') {
      return res.status(400).json({ error: 'wallet_address is required' });
    }

    // Find the deal
    const deal = await prisma.deal.findUnique({
      where: { id: dealId },
    });

    if (!deal) {
      return res.status(404).json({ error: 'Deal not found' });
    }

    // Verify deal is in DISPUTED status
    if (deal.status !== 'DISPUTED') {
      return res.status(400).json({
        error: `Cannot submit evidence: deal is in ${deal.status} status (must be DISPUTED)`
      });
    }

    // Verify caller is buyer or seller of this deal
    const isBuyer = deal.buyerWallet === wallet_address;
    const isSeller = deal.sellerWallet === wallet_address;
    if (!isBuyer && !isSeller) {
      return res.status(403).json({ error: 'Only the buyer or seller of this deal can submit evidence' });
    }

    // Find the user by wallet
    const user = await prisma.user.findUnique({
      where: { walletAddress: wallet_address },
      select: { id: true },
    });

    if (!user) {
      return res.status(404).json({ error: 'User not found. Please set up your profile first.' });
    }

    // Store description as CID placeholder (text evidence stored directly)
    // In future sprints, file evidence will use Arweave/IPFS and store actual CIDs
    const mimeType = type || 'text/plain';

    const evidence = await prisma.evidence.create({
      data: {
        dealId,
        submittedById: user.id,
        cid: description, // For text evidence, store the text directly as CID placeholder
        mimeType,
      },
      include: {
        submittedBy: {
          select: {
            walletAddress: true,
            displayName: true,
          }
        }
      }
    });

    res.status(201).json({
      id: evidence.id,
      deal_id: evidence.dealId,
      description: evidence.cid,
      mime_type: evidence.mimeType,
      submitted_by: evidence.submittedBy.walletAddress,
      submitted_by_name: evidence.submittedBy.displayName,
      submitted_at: evidence.submittedAt.toISOString(),
      role: isBuyer ? 'buyer' : 'seller',
    });
  } catch (error) {
    console.error('Failed to submit evidence:', error);
    res.status(500).json({ error: 'Failed to submit evidence' });
  }
});

// GET /api/deals/:id/evidence - List all evidence for a deal
router.get('/:id/evidence', async (req, res) => {
  try {
    const { id: dealId } = req.params;

    // Verify deal exists
    const deal = await prisma.deal.findUnique({
      where: { id: dealId },
      select: { id: true, buyerWallet: true, sellerWallet: true },
    });

    if (!deal) {
      return res.status(404).json({ error: 'Deal not found' });
    }

    const evidenceList = await prisma.evidence.findMany({
      where: { dealId },
      include: {
        submittedBy: {
          select: {
            walletAddress: true,
            displayName: true,
          }
        }
      },
      orderBy: { submittedAt: 'asc' },
    });

    const mapped = evidenceList.map(e => ({
      id: e.id,
      deal_id: e.dealId,
      description: e.cid,
      mime_type: e.mimeType,
      submitted_by: e.submittedBy.walletAddress,
      submitted_by_name: e.submittedBy.displayName,
      submitted_at: e.submittedAt.toISOString(),
      role: e.submittedBy.walletAddress === deal.buyerWallet ? 'buyer' : 'seller',
    }));

    res.json({ evidence: mapped, total: mapped.length });
  } catch (error) {
    console.error('Failed to fetch evidence:', error);
    res.status(500).json({ error: 'Failed to fetch evidence' });
  }
});

// ============================================================
// Deal deletion
// ============================================================

// DELETE /api/deals/:id - Delete a deal (only if INIT)
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const deal = await prisma.deal.findUnique({
      where: { id }
    });

    if (!deal) {
      return res.status(404).json({ error: 'Deal not found' });
    }

    if (deal.status !== 'INIT') {
      return res.status(400).json({ error: 'Only deals in INIT status can be deleted' });
    }

    await prisma.deal.delete({
      where: { id }
    });

    res.json({ success: true, message: 'Deal deleted successfully' });
  } catch (error) {
    console.error('Failed to delete deal:', error);
    res.status(500).json({ error: 'Failed to delete deal' });
  }
});

// ============================================================
// Arbitration endpoints (Sprint 4.5)
// ============================================================

// POST /api/deals/:id/arbitrate - Trigger AI arbitration
router.post('/:id/arbitrate', async (req, res) => {
  try {
    const { id: dealId } = req.params;

    // 1. Fetch deal from database (with buyer, seller relations)
    const deal = await prisma.deal.findUnique({
      where: { id: dealId },
      include: {
        buyer: true,
        seller: true,
      }
    });

    if (!deal) {
      return res.status(404).json({ error: 'Deal not found' });
    }

    // 2. Validate deal status is DISPUTED
    if (deal.status !== 'DISPUTED') {
      return res.status(400).json({
        error: `Cannot trigger arbitration: deal is in ${deal.status} status (must be DISPUTED)`
      });
    }

    // Check if ticket already exists (idempotent)
    const existingTicket = await prisma.resolveTicket.findFirst({
      where: { dealId },
      orderBy: { issuedAt: 'desc' }
    });

    if (existingTicket) {
      // Return existing ticket
      return res.json({
        ticket: {
          schema: 'https://artha.network/schemas/resolve-ticket-v1.json',
          deal_id: dealId,
          outcome: existingTicket.finalAction,
          reason_short: 'Previously generated verdict',
          rationale_cid: existingTicket.rationaleCid,
          violated_rules: [],
          confidence: Number(existingTicket.confidence),
          nonce: '0',
          expires_at_utc: existingTicket.expiresAt?.toISOString() || new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
        },
        arbiter_pubkey: existingTicket.arbiterPubkey,
        ed25519_signature: existingTicket.signature
      });
    }

    // 3. Fetch all evidence for the deal
    const evidenceList = await prisma.evidence.findMany({
      where: { dealId },
      include: {
        submittedBy: {
          select: {
            walletAddress: true
          }
        }
      },
      orderBy: { submittedAt: 'asc' }
    });

    // 4. Validate at least one evidence exists
    if (evidenceList.length === 0) {
      return res.status(400).json({ error: 'No evidence found for arbitration' });
    }

    // 5. Format request payload matching arbiter service schema
    const arbitrationRequest = {
      deal: {
        deal_id: dealId,
        seller: deal.sellerWallet || deal.seller.walletAddress || '',
        buyer: deal.buyerWallet || deal.buyer.walletAddress || '',
        amount: Number(deal.priceUsd),
        mint: deal.depositTokenMint,
        dispute_by: Math.floor(deal.disputeDeadline.getTime() / 1000), // Unix timestamp
        fee_bps: deal.feeBps,
        created_at: Math.floor(deal.createdAt.getTime() / 1000), // Unix timestamp
        status: 'Disputed'
      },
      evidence: evidenceList.map(e => {
        const submittedBy = e.submittedBy.walletAddress === deal.buyerWallet ? 'buyer' : 'seller';

        // Determine evidence type based on MIME type
        let evidenceType: 'text' | 'pdf' | 'image' | 'json' = 'text';
        if (e.mimeType.includes('pdf')) {
          evidenceType = 'pdf';
        } else if (e.mimeType.includes('image')) {
          evidenceType = 'image';
        } else if (e.mimeType.includes('json')) {
          evidenceType = 'json';
        }

        return {
          cid: e.cid,
          type: evidenceType,
          description: e.cid, // For text evidence, cid contains the text
          submitted_by: submittedBy,
          submitted_at: Math.floor(e.submittedAt.getTime() / 1000), // Unix timestamp
          extracted_text: evidenceType === 'text' ? e.cid : undefined
        };
      }),
      seller_claim: 'I fulfilled my obligations as agreed', // Default claim
      buyer_claim: 'The terms were not met as specified' // Default claim
    };

    // 6. Call arbiter service
    const ARBITER_SERVICE_URL = process.env.ARBITER_SERVICE_URL || 'http://localhost:3001';
    const adminKey = process.env.ARBITER_ADMIN_KEY;
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (adminKey) headers['x-admin-key'] = adminKey;

    let arbiterResponse;
    try {
      const response = await fetch(`${ARBITER_SERVICE_URL}/arbitrate`, {
        method: 'POST',
        headers,
        body: JSON.stringify(arbitrationRequest)
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Arbiter service returned ${response.status}: ${errorText}`);
      }

      arbiterResponse = await response.json();
    } catch (error: any) {
      console.error('Failed to call arbiter service:', error);
      return res.status(500).json({
        error: 'Failed to call arbiter service',
        details: error.message
      });
    }

    // 7. Parse response: SignedResolveTicket
    const { ticket, arbiter_pubkey, ed25519_signature } = arbiterResponse;

    // 8. Store in database
    const resolveTicket = await prisma.resolveTicket.create({
      data: {
        dealId: deal.id,
        finalAction: ticket.outcome, // 'RELEASE' or 'REFUND'
        sellerBps: null, // SPLIT not implemented yet
        confidence: ticket.confidence,
        rationaleCid: ticket.rationale_cid,
        arbiterPubkey: arbiter_pubkey,
        signature: ed25519_signature,
        source: 'AI',
        expiresAt: new Date(ticket.expires_at_utc)
      }
    });

    // 9. Update deal status to RESOLVED
    await prisma.deal.update({
      where: { id: dealId },
      data: { status: 'RESOLVED' }
    });

    // 10. Return the ticket to client
    res.json({
      ticket,
      arbiter_pubkey,
      ed25519_signature
    });
  } catch (error) {
    console.error('Failed to trigger arbitration:', error);
    res.status(500).json({ error: 'Failed to trigger arbitration' });
  }
});

// GET /api/deals/:id/resolution - Fetch stored verdict
router.get('/:id/resolution', async (req, res) => {
  try {
    const { id: dealId } = req.params;

    // Verify deal exists
    const deal = await prisma.deal.findUnique({
      where: { id: dealId },
      select: { id: true }
    });

    if (!deal) {
      return res.status(404).json({ error: 'Deal not found' });
    }

    // Fetch the most recent ResolveTicket for the deal
    const resolveTicket = await prisma.resolveTicket.findFirst({
      where: { dealId },
      orderBy: { issuedAt: 'desc' }
    });

    if (!resolveTicket) {
      return res.status(404).json({ error: 'No resolution found for this deal' });
    }

    // Return formatted response
    res.json({
      deal_id: dealId,
      outcome: resolveTicket.finalAction,
      confidence: Number(resolveTicket.confidence),
      reason_short: 'AI arbitration verdict',
      rationale_cid: resolveTicket.rationaleCid,
      violated_rules: [],
      arbiter_pubkey: resolveTicket.arbiterPubkey,
      signature: resolveTicket.signature,
      issued_at: resolveTicket.issuedAt.toISOString(),
      expires_at: resolveTicket.expiresAt?.toISOString() || null
    });
  } catch (error) {
    console.error('Failed to fetch resolution:', error);
    res.status(500).json({ error: 'Failed to fetch resolution' });
  }
});

export default router;