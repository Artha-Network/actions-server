import express from "express";
import {
  InitiateActionSchema,
  FundActionSchema,
  ReleaseActionSchema,
  RefundActionSchema,
  ConfirmActionSchema,
} from "../types/actions";
import { escrowService } from "../services/escrow-service";

const router = express.Router();

const toErrorMessage = (err: unknown) => (err instanceof Error ? err.message : "unknown_error");

const getReqId = (req: express.Request) => (req.headers["x-request-id"] as string | undefined);

router.post("/initiate", async (req, res) => {
  const parsed = InitiateActionSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.message });
  }
  try {
    const result = await escrowService.initiate(parsed.data, { reqId: getReqId(req) });
    return res.status(200).json(result);
  } catch (error) {
    return res.status(400).json({ error: toErrorMessage(error) });
  }
});

router.post("/fund", async (req, res) => {
  const parsed = FundActionSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.message });
  }
  try {
    const result = await escrowService.fund(parsed.data, { reqId: getReqId(req) });
    return res.status(200).json(result);
  } catch (error) {
    return res.status(400).json({ error: toErrorMessage(error) });
  }
});

router.post("/release", async (req, res) => {
  const parsed = ReleaseActionSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.message });
  }
  try {
    const result = await escrowService.release(parsed.data, { reqId: getReqId(req) });
    return res.status(200).json(result);
  } catch (error) {
    return res.status(400).json({ error: toErrorMessage(error) });
  }
});

router.post("/refund", async (req, res) => {
  const parsed = RefundActionSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.message });
  }
  try {
    const result = await escrowService.refund(parsed.data, { reqId: getReqId(req) });
    return res.status(200).json(result);
  } catch (error) {
    return res.status(400).json({ error: toErrorMessage(error) });
  }
});

router.post("/confirm", async (req, res) => {
  const parsed = ConfirmActionSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.message });
  }
  try {
    const result = await escrowService.confirm(parsed.data, { reqId: getReqId(req) });
    return res.status(200).json(result);
  } catch (error) {
    return res.status(400).json({ error: toErrorMessage(error) });
  }
});

export default router;
