import type { Request, Response } from "express";
import { escrowService } from "../../services/escrow-service";

/** POST /api/escrow/dispute */
export async function disputeHandler(req: Request, res: Response) {
  res.status(501).json({ error: "Dispute handling moved to /actions endpoints" });
}

