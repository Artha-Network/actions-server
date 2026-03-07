import { Router, Request, Response } from "express";
import { prisma } from "../lib/prisma";
import { escrowService } from "../services/escrow-service";
import { DealStatus, TitleStatus } from "@prisma/client";

const router = Router();

/**
 * POST /gov/title-transfer
 * Simulated DMV webhook: marks a vehicle title as transferred and triggers
 * on-chain RESOLVE (arbiter-signed) for the associated deal.
 */
router.post("/title-transfer", async (req: Request, res: Response) => {
  try {
    const { vin, new_owner_wallet, deal_id } = req.body;

    if (!vin || typeof vin !== "string") {
      return res.status(400).json({ error: "vin is required" });
    }
    if (!new_owner_wallet || typeof new_owner_wallet !== "string") {
      return res.status(400).json({ error: "new_owner_wallet is required" });
    }

    // 1. Find and validate title
    const title = await prisma.vehicleTitle.findUnique({ where: { vin } });
    if (!title) {
      return res.status(404).json({ error: `No vehicle title found for VIN ${vin}` });
    }
    if (title.titleStatus === TitleStatus.TRANSFERRED) {
      return res.status(409).json({ error: "Title has already been transferred" });
    }

    // 2. Update title
    await prisma.vehicleTitle.update({
      where: { vin },
      data: {
        titleStatus: TitleStatus.TRANSFERRED,
        currentOwnerWallet: new_owner_wallet,
        transferDate: new Date(),
        updatedAt: new Date(),
      },
    });

    // 3. Find associated deal
    let deal;
    if (deal_id) {
      deal = await prisma.deal.findUnique({ where: { id: deal_id } });
    } else {
      // Find deal by VIN
      deal = await prisma.deal.findFirst({
        where: { vin, status: DealStatus.FUNDED },
        orderBy: { createdAt: "desc" },
      });
    }

    if (!deal || deal.status !== DealStatus.FUNDED) {
      return res.json({
        success: true,
        title_transferred: true,
        deal_resolved: false,
        message: "Title transferred but no FUNDED deal found to resolve",
      });
    }

    // 4. Create ResolveTicket
    const arbiterHex = process.env.ARBITER_ED25519_SECRET_HEX;
    if (!arbiterHex) {
      return res.status(500).json({ error: "Arbiter key not configured" });
    }

    // Derive arbiter pubkey for the ticket record
    const { Keypair } = await import("@solana/web3.js");
    const secretBytes = Buffer.from(arbiterHex.replace(/^0x/i, ""), "hex");
    const arbiterKeypair =
      secretBytes.length === 64
        ? Keypair.fromSecretKey(new Uint8Array(secretBytes))
        : Keypair.fromSeed(new Uint8Array(secretBytes));
    const arbiterPubkey = arbiterKeypair.publicKey.toBase58();

    await prisma.resolveTicket.create({
      data: {
        dealId: deal.id,
        finalAction: "RELEASE",
        confidence: 1.0,
        rationaleCid: "Title transferred via government registry",
        arbiterPubkey,
        signature: "gov-title-transfer",
        source: "AI",
      },
    });

    // 5. On-chain RESOLVE (arbiter-signed)
    const resolveResult = await escrowService.resolve({
      dealId: deal.id,
      verdict: "RELEASE",
    });

    // 6. Confirm the resolve in DB (updates status to RESOLVED)
    if (resolveResult.txSig) {
      await escrowService.confirm({
        dealId: deal.id,
        txSig: resolveResult.txSig,
        action: "RESOLVE",
        actorWallet: arbiterPubkey,
      });
    }

    return res.json({
      success: true,
      title_transferred: true,
      deal_resolved: true,
      deal_id: deal.id,
      resolve_tx: resolveResult.txSig || null,
    });
  } catch (error: any) {
    console.error("[gov/title-transfer] Error:", error);
    return res.status(500).json({ error: error.message || "Internal server error" });
  }
});

/**
 * GET /gov/title/:vin
 * Title status lookup (for demo UI).
 */
router.get("/title/:vin", async (req: Request, res: Response) => {
  try {
    const { vin } = req.params;
    const title = await prisma.vehicleTitle.findUnique({ where: { vin } });

    if (!title) {
      return res.status(404).json({ error: `No vehicle title found for VIN ${vin}` });
    }

    return res.json({
      vin: title.vin,
      current_owner_wallet: title.currentOwnerWallet,
      title_status: title.titleStatus,
      transfer_date: title.transferDate,
      created_at: title.createdAt,
      updated_at: title.updatedAt,
    });
  } catch (error: any) {
    console.error("[gov/title] Error:", error);
    return res.status(500).json({ error: error.message || "Internal server error" });
  }
});

/**
 * GET /gov/titles
 * List all vehicle titles (for testing/demo dashboard).
 */
router.get("/titles", async (_req: Request, res: Response) => {
  try {
    const titles = await prisma.vehicleTitle.findMany({
      orderBy: { createdAt: "desc" },
    });

    return res.json({
      titles: titles.map((t) => ({
        id: t.id,
        vin: t.vin,
        current_owner_wallet: t.currentOwnerWallet,
        title_status: t.titleStatus,
        transfer_date: t.transferDate,
        created_at: t.createdAt,
        updated_at: t.updatedAt,
      })),
      total: titles.length,
    });
  } catch (error: any) {
    console.error("[gov/titles] Error:", error);
    return res.status(500).json({ error: error.message || "Internal server error" });
  }
});

/**
 * POST /gov/seed
 * Seed fake VehicleTitle records for development/testing.
 * DISABLED in production.
 */
router.post("/seed", async (req: Request, res: Response) => {
  if (process.env.NODE_ENV === "production") {
    return res.status(403).json({ error: "Seed endpoint disabled in production" });
  }

  try {
    const seedVins = [
      { vin: "1HGBH41JXMN109186", ownerWallet: "11111111111111111111111111111111" },
      { vin: "2T1BURHE0JC039861", ownerWallet: "22222222222222222222222222222222" },
      { vin: "3VWFE21C04M000001", ownerWallet: "33333333333333333333333333333333" },
    ];

    const results = [];
    for (const seed of seedVins) {
      const title = await prisma.vehicleTitle.upsert({
        where: { vin: seed.vin },
        update: {
          currentOwnerWallet: seed.ownerWallet,
          titleStatus: "PENDING",
          transferDate: null,
        },
        create: {
          vin: seed.vin,
          currentOwnerWallet: seed.ownerWallet,
        },
      });
      results.push({ vin: title.vin, status: title.titleStatus });
    }

    return res.json({ seeded: results.length, titles: results });
  } catch (error: any) {
    console.error("[gov/seed] Error:", error);
    return res.status(500).json({ error: error.message || "Internal server error" });
  }
});

export default router;
