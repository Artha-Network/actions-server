import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import { createUserIfMissing } from '../services/user.service';

const router = Router();
const prisma = new PrismaClient();

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

export default router;