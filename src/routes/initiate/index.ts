import type { Request, Response } from "express";
import { escrowService } from "../../services/escrow-service";

/** POST /api/escrow/initiate */
export async function initiateHandler(req: Request, res: Response) {
  try {
    const result = await escrowService.initiate(req.body);
    res.status(201).json(result);
  } catch (e: any) {
    res.status(400).json({ error: e?.message ?? "bad_request" });
  }
}

