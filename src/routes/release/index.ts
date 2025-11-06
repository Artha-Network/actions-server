import type { Request, Response } from "express";
import { ReleaseActionSchema } from "../../types/actions";
import { escrowService } from "../../services/escrow-service";

/** POST /api/escrow/release */
export async function releaseHandler(req: Request, res: Response) {
  const parsed = ReleaseActionSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.message });
  }
  try {
    const result = await escrowService.release(parsed.data, { reqId: req.headers["x-request-id"] as string | undefined });
    res.status(200).json(result);
  } catch (e: any) {
    res.status(400).json({ error: e?.message ?? "bad_request" });
  }
}
