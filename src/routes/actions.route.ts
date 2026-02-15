import express from "express";
import {
  InitiateActionSchema,
  FundActionSchema,
  ReleaseActionSchema,
  RefundActionSchema,
  OpenDisputeActionSchema,
  ResolveActionSchema,
  ConfirmActionSchema,
} from "../types/actions";
import { escrowService } from "../services/escrow-service";
import { simulateVersionedTransaction, refreshTransactionBlockhash } from "../solana/transaction";
import { PublicKey } from "@solana/web3.js";
import nacl from "tweetnacl";

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

router.post("/open-dispute", async (req, res) => {
  const parsed = OpenDisputeActionSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.message });
  }
  try {
    const result = await escrowService.openDispute(parsed.data, { reqId: getReqId(req) });
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

/**
 * POST /api/actions/simulate
 * Simulate a transaction and return full error details including logs
 */
router.post("/simulate", async (req, res) => {
  const { txMessageBase64 } = req.body;
  if (!txMessageBase64 || typeof txMessageBase64 !== "string") {
    return res.status(400).json({ error: "txMessageBase64 is required" });
  }
  try {
    const result = await simulateVersionedTransaction(txMessageBase64);
    if (result.error) {
      return res.status(400).json({
        error: result.error.message,
        logs: result.error.logs,
        simulation: null,
      });
    }
    return res.status(200).json({
      simulation: result.simulation,
      error: null,
    });
  } catch (error) {
    return res.status(500).json({ 
      error: toErrorMessage(error),
      logs: [],
    });
  }
});

/**
 * POST /api/actions/refresh-blockhash
 * Refresh the blockhash on an existing transaction.
 * Use this if there's any delay between building and sending.
 */
router.post("/refresh-blockhash", async (req, res) => {
  const { txMessageBase64 } = req.body;
  if (!txMessageBase64 || typeof txMessageBase64 !== "string") {
    return res.status(400).json({ error: "txMessageBase64 is required" });
  }
  try {
    const result = await refreshTransactionBlockhash(txMessageBase64);
    return res.status(200).json(result);
  } catch (error) {
    return res.status(500).json({ error: toErrorMessage(error) });
  }
});

/**
 * POST /api/actions/verify-signature
 * Verify wallet signature for initiate flow and continue as if on-chain step succeeded.
 * This endpoint skips blockchain writes and only verifies wallet ownership.
 */
router.post("/verify-signature", async (req, res) => {
  const { dealId, wallet, signature, message } = req.body;
  
  if (!dealId || typeof dealId !== "string") {
    return res.status(400).json({ error: "dealId is required" });
  }
  if (!wallet || typeof wallet !== "string") {
    return res.status(400).json({ error: "wallet is required" });
  }
  if (!signature || !Array.isArray(signature)) {
    return res.status(400).json({ error: "signature is required and must be an array" });
  }
  if (!message || typeof message !== "string") {
    return res.status(400).json({ error: "message is required" });
  }

  try {
    // Verify signature
    const publicKey = new PublicKey(wallet);
    const messageBytes = new TextEncoder().encode(message);
    const signatureBytes = new Uint8Array(signature);
    const publicKeyBytes = publicKey.toBytes();

    const verified = nacl.sign.detached.verify(messageBytes, signatureBytes, publicKeyBytes);

    if (!verified) {
      return res.status(401).json({ error: "Invalid signature" });
    }

    console.log("[verify-signature] Signature verified for wallet:", wallet);
    console.log("[verify-signature] Deal ID:", dealId);

    // Wait 2-4 seconds as requested
    const waitTime = 2000 + Math.random() * 2000; // 2-4 seconds
    console.log("[verify-signature] Waiting", Math.round(waitTime), "ms before continuing...");
    await new Promise(resolve => setTimeout(resolve, waitTime));

    console.log("[verify-signature] Signature verified. Continuing...");

    return res.status(200).json({
      success: true,
      message: "Signature verified. Continuing...",
      dealId,
      wallet,
    });
  } catch (error) {
    console.error("[verify-signature] Error:", error);
    return res.status(500).json({ error: toErrorMessage(error) });
  }
});

export default router;
