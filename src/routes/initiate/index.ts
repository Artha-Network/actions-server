import type { Request, Response } from "express";
import { InitiateActionSchema } from "../../types/actions";
import { escrowService } from "../../services/escrow-service";

/** POST /api/escrow/initiate */
export async function initiateHandler(req: Request, res: Response) {
  const parsed = InitiateActionSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.message });
  }
  try {
    const result = await escrowService.initiate(parsed.data, { reqId: req.headers["x-request-id"] as string | undefined });
    res.status(201).json(result);
  } catch (e: any) {
    res.status(400).json({ error: e?.message ?? "bad_request" });
  }
}
