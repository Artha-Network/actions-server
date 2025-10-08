import type { Request, Response } from "express";
import { escrowService } from "../../services/escrow-service";

/** POST /api/escrow/release */
export async function releaseHandler(req: Request, res: Response) {
  try {
    const result = await escrowService.release(req.body);
    res.status(200).json(result);
  } catch (e: any) {
    res.status(400).json({ error: e?.message ?? "bad_request" });
  }
}

