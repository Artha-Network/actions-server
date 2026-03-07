import { Router } from 'express';
import multer from 'multer';
import { createUserIfMissing } from '../services/user.service';
import { prisma } from '../lib/prisma';
import { supabaseAdmin } from '../lib/supabaseAdmin';
import { createNotificationByWallet } from '../services/notification.service';

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

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
        description: true,
        buyerEmail: true,
        sellerEmail: true,
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
      description: deal.description,
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

// ============================================================
// Human Arbiter access (must be before /:id to avoid route collision)
// ============================================================

const HUMAN_ARBITER_WALLET = 'J5VHnSRxVizNgT6xCmoBNnXPU7EDfYJ9xvRjYTK5Xppo';

// GET /api/deals/arbiter/disputed - List all disputed deals (human arbiter only)
router.get('/arbiter/disputed', async (req, res) => {
  try {
    const { wallet_address } = req.query;

    if (wallet_address !== HUMAN_ARBITER_WALLET) {
      return res.status(403).json({ error: 'Unauthorized — only the human arbiter can access this endpoint' });
    }

    const deals = await prisma.deal.findMany({
      where: { status: { in: ['DISPUTED', 'RESOLVED'] } },
      include: {
        buyer: { select: { walletAddress: true, displayName: true, emailAddress: true } },
        seller: { select: { walletAddress: true, displayName: true, emailAddress: true } },
        evidence: {
          include: { submittedBy: { select: { walletAddress: true, displayName: true } } },
          orderBy: { submittedAt: 'asc' },
        },
        onchainEvents: { orderBy: { createdAt: 'desc' } },
        tickets: { orderBy: { issuedAt: 'desc' }, take: 1 },
      },
      orderBy: { updatedAt: 'desc' },
    });

    const mapped = deals.map(deal => {
      const latestTicket = deal.tickets[0] ?? null;
      return {
        id: deal.id,
        title: deal.title,
        description: deal.description,
        contract: deal.contract,
        status: deal.status,
        price_usd: deal.priceUsd.toString(),
        buyer_wallet: deal.buyerWallet,
        seller_wallet: deal.sellerWallet,
        buyer_email: deal.buyerEmail,
        seller_email: deal.sellerEmail,
        vin: deal.vin,
        deliver_deadline: deal.deliverDeadline?.toISOString(),
        dispute_deadline: deal.disputeDeadline?.toISOString(),
        created_at: deal.createdAt.toISOString(),
        updated_at: deal.updatedAt.toISOString(),
        buyer: deal.buyer ? { display_name: deal.buyer.displayName, email: deal.buyer.emailAddress } : null,
        seller_profile: deal.seller ? { display_name: deal.seller.displayName, email: deal.seller.emailAddress } : null,
        evidence: deal.evidence.map(e => ({
          id: e.id,
          description: e.cid,
          mime_type: e.mimeType,
          submitted_by: e.submittedBy.walletAddress,
          submitted_by_name: e.submittedBy.displayName,
          submitted_at: e.submittedAt.toISOString(),
          role: e.submittedBy.walletAddress === deal.buyerWallet ? 'buyer' : 'seller',
        })),
        ai_resolution: latestTicket ? {
          outcome: latestTicket.finalAction,
          confidence: Number(latestTicket.confidence),
          rationale: latestTicket.rationaleCid,
          issued_at: latestTicket.issuedAt?.toISOString(),
        } : null,
        onchain_events: deal.onchainEvents.map(e => ({
          id: e.id,
          tx_sig: e.txSig,
          instruction: e.instruction,
          created_at: e.createdAt.toISOString(),
        })),
      };
    });

    res.json({ deals: mapped, total: mapped.length });
  } catch (error) {
    console.error('Failed to fetch arbiter deals:', error);
    res.status(500).json({ error: 'Failed to fetch arbiter deals' });
  }
});

// GET /api/deals/:id - Get specific deal (mapped to snake_case)
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const deal = await prisma.deal.findUnique({
      where: { id },
      include: {
        buyer: { select: { walletAddress: true, displayName: true, reputationScore: true } },
        seller: { select: { walletAddress: true, displayName: true, reputationScore: true } },
        onchainEvents: { orderBy: { createdAt: 'desc' } },
      }
    });

    if (!deal) {
      return res.status(404).json({ error: 'Deal not found' });
    }

    res.json({
      id: deal.id,
      title: deal.title,
      description: deal.description,
      status: deal.status,
      price_usd: deal.priceUsd.toString(),
      buyer_wallet: deal.buyerWallet,
      seller_wallet: deal.sellerWallet,
      buyer_email: deal.buyerEmail,
      seller_email: deal.sellerEmail,
      vin: deal.vin,
      contract: deal.contract || null,
      deliver_deadline: deal.deliverDeadline?.toISOString() || null,
      dispute_deadline: deal.disputeDeadline?.toISOString() || null,
      funded_at: deal.fundedAt?.toISOString() || null,
      created_at: deal.createdAt.toISOString(),
      updated_at: deal.updatedAt.toISOString(),
      fee_bps: deal.feeBps,
      onchain_address: deal.onchainAddress,
      buyer: deal.buyer ? {
        display_name: deal.buyer.displayName,
        reputation_score: Number(deal.buyer.reputationScore),
      } : null,
      seller: deal.seller ? {
        display_name: deal.seller.displayName,
        reputation_score: Number(deal.seller.reputationScore),
      } : null,
      onchain_events: deal.onchainEvents.map(e => ({
        id: e.id,
        tx_sig: e.txSig,
        slot: e.slot.toString(),
        instruction: e.instruction,
        created_at: e.createdAt.toISOString(),
      })),
    });
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
            sellerWallet: true,
            title: true,
            status: true,
            priceUsd: true,
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

    // Store text evidence directly as cid field; file evidence uses the /evidence/upload endpoint
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

// POST /api/deals/:id/evidence/upload - Upload a file as evidence to Supabase Storage
router.post('/:id/evidence/upload', upload.single('file'), async (req, res) => {
  try {
    const { id: dealId } = req.params;
    const { wallet_address } = req.query;
    const file = req.file;

    if (!wallet_address || typeof wallet_address !== 'string') {
      return res.status(400).json({ error: 'wallet_address is required' });
    }
    if (!file) {
      return res.status(400).json({ error: 'file is required' });
    }

    const deal = await prisma.deal.findUnique({
      where: { id: dealId },
      select: { id: true, status: true, buyerWallet: true, sellerWallet: true },
    });
    if (!deal) return res.status(404).json({ error: 'Deal not found' });
    if (deal.status !== 'DISPUTED') {
      return res.status(400).json({ error: `Cannot upload evidence: deal is in ${deal.status} status (must be DISPUTED)` });
    }
    if (deal.buyerWallet !== wallet_address && deal.sellerWallet !== wallet_address) {
      return res.status(403).json({ error: 'Only the buyer or seller of this deal can submit evidence' });
    }

    const user = await prisma.user.findUnique({
      where: { walletAddress: wallet_address },
      select: { id: true },
    });
    if (!user) return res.status(404).json({ error: 'User not found' });

    const storagePath = `${dealId}/${Date.now()}_${file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
    const { error: uploadError } = await supabaseAdmin.storage
      .from('evidence-files')
      .upload(storagePath, file.buffer, { contentType: file.mimetype, upsert: false });

    if (uploadError) {
      console.error('Supabase Storage upload error:', uploadError);
      return res.status(500).json({ error: 'File upload failed', details: uploadError.message });
    }

    const evidence = await prisma.evidence.create({
      data: {
        dealId,
        submittedById: user.id,
        cid: storagePath,
        mimeType: file.mimetype,
      },
    });

    return res.status(201).json({
      id: evidence.id,
      path: storagePath,
      file_name: file.originalname,
      mime_type: file.mimetype,
    });
  } catch (error) {
    console.error('Failed to upload evidence file:', error);
    res.status(500).json({ error: 'Failed to upload evidence file' });
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
      seller_claim: deal.metadata && typeof deal.metadata === 'object' && !Array.isArray(deal.metadata)
        ? `I fulfilled my obligations as agreed. Vehicle details: ${JSON.stringify(deal.metadata)}`
        : 'I fulfilled my obligations as agreed',
      buyer_claim: deal.metadata && typeof deal.metadata === 'object' && !Array.isArray(deal.metadata)
        ? `The terms were not met as specified. Vehicle details: ${JSON.stringify(deal.metadata)}`
        : 'The terms were not met as specified'
    };

    // 6. Call arbiter service
    const ARBITER_SERVICE_URL = process.env.ARBITER_SERVICE_URL || 'http://localhost:3001';
    const adminKey = process.env.ARBITER_ADMIN_KEY;
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (adminKey) headers['x-admin-key'] = adminKey;

    let arbiterResponse;
    try {
      const arbiterAbortController = new AbortController();
      const arbiterTimeout = setTimeout(() => arbiterAbortController.abort(), 30_000);
      const response = await fetch(`${ARBITER_SERVICE_URL}/arbitrate`, {
        method: 'POST',
        headers,
        body: JSON.stringify(arbitrationRequest),
        signal: arbiterAbortController.signal,
      });
      clearTimeout(arbiterTimeout);

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

    // 10. Notify both parties of the arbitration result (non-blocking)
    if (deal.buyerWallet) {
      createNotificationByWallet(deal.buyerWallet, "AI arbitration complete", {
        body: `Verdict: ${ticket.outcome}. View the resolution to execute.`,
        type: "resolution",
        dealId,
      });
    }
    if (deal.sellerWallet) {
      createNotificationByWallet(deal.sellerWallet, "AI arbitration complete", {
        body: `Verdict: ${ticket.outcome}. View the resolution to execute.`,
        type: "resolution",
        dealId,
      });
    }

    // 11. Return the ticket to client
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

// ============================================================
// Car escrow plan endpoint
// ============================================================

type DeliveryType = 'local_pickup' | 'same_city_carrier' | 'cross_country_carrier';

interface CarSaleInput {
  priceUsd: number;
  deliveryType: DeliveryType;
  hasTitleInHand: boolean;
  odometerMiles: number;
  year: number;
  isSalvageTitle?: boolean;
}

function computeCarEscrowPlan(input: CarSaleInput) {
  const reasons: string[] = [];
  let score = 1;
  const nowYear = new Date().getFullYear();
  const ageYears = Math.max(0, nowYear - input.year);

  if (input.priceUsd >= 20000) { score += 3; reasons.push('High-value vehicle (>= $20k)'); }
  else if (input.priceUsd >= 10000) { score += 2; reasons.push('Mid-value vehicle (>= $10k)'); }

  if (input.deliveryType === 'cross_country_carrier') { score += 3; reasons.push('Cross-country / remote delivery'); }
  else if (input.deliveryType === 'same_city_carrier') { score += 2; reasons.push('Same-city carrier (no in-person hand-off)'); }
  else { reasons.push('Local pickup (in-person)'); }

  if (!input.hasTitleInHand) { score += 2; reasons.push('Seller does not have clear title in hand'); }
  if (input.isSalvageTitle) { score += 2; reasons.push('Salvage / rebuilt title'); }
  if (ageYears >= 15) { score += 1; reasons.push('Older vehicle (>= 15 years)'); }
  if (input.odometerMiles >= 150_000) { score += 1; reasons.push('High mileage (>= 150k miles)'); }

  score = Math.max(1, Math.min(score, 10));
  const riskLevel: 'low' | 'medium' | 'high' = score <= 3 ? 'low' : score <= 6 ? 'medium' : 'high';

  const now = Date.now();
  let deliveryDeadlineHours = 24;
  if (input.deliveryType === 'same_city_carrier') deliveryDeadlineHours = 72;
  else if (input.deliveryType === 'cross_country_carrier') deliveryDeadlineHours = 7 * 24;

  let disputeWindowHours = 48;
  if (score >= 7) disputeWindowHours = 7 * 24;
  else if (score >= 4) disputeWindowHours = 3 * 24;

  const reminderMinutesBefore: number[] = [];
  if (deliveryDeadlineHours >= 48) reminderMinutesBefore.push(24 * 60);
  if (deliveryDeadlineHours >= 24) reminderMinutesBefore.push(6 * 60);
  reminderMinutesBefore.push(60);

  const deliveryDeadlineMs = now + deliveryDeadlineHours * 60 * 60 * 1000;
  const disputeEndMs = deliveryDeadlineMs + disputeWindowHours * 60 * 60 * 1000;

  return {
    riskScore: score,
    riskLevel,
    reasons,
    deliveryDeadlineHoursFromNow: deliveryDeadlineHours,
    disputeWindowHours,
    reminderMinutesBefore,
    deliveryDeadlineAtIso: new Date(deliveryDeadlineMs).toISOString(),
    disputeWindowEndsAtIso: new Date(disputeEndMs).toISOString(),
  };
}

// POST /api/car-escrow/plan - Compute risk profile and deadlines for a car sale
router.post('/car-escrow/plan', (req, res) => {
  const body = req.body as Partial<CarSaleInput>;

  if (
    typeof body.priceUsd !== 'number' ||
    typeof body.deliveryType !== 'string' ||
    typeof body.hasTitleInHand !== 'boolean' ||
    typeof body.odometerMiles !== 'number' ||
    typeof body.year !== 'number'
  ) {
    return res.status(400).json({
      error: 'Required: priceUsd (number), deliveryType (string), hasTitleInHand (boolean), odometerMiles (number), year (number)',
    });
  }

  if (!['local_pickup', 'same_city_carrier', 'cross_country_carrier'].includes(body.deliveryType)) {
    return res.status(400).json({
      error: 'deliveryType must be: local_pickup | same_city_carrier | cross_country_carrier',
    });
  }

  const plan = computeCarEscrowPlan(body as CarSaleInput);
  return res.json({ ok: true, plan });
});

export default router;