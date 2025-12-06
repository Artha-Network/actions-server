/**
 * User Route
 * Exposes POST /api/users to find or create a user by wallet address.
 */
import express from "express";
import { createUserIfMissing } from "../services/user.service";

const router = express.Router();

router.post("/", async (req, res) => {
  const { walletAddress } = req.body ?? {};
  if (typeof walletAddress !== "string" || walletAddress.length === 0) {
    return res.status(400).json({ error: "walletAddress is required" });
  }
  try {
    const user = await createUserIfMissing(walletAddress);
    return res.json(user);
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error("/api/users error", e);
    return res.status(500).json({
      error: "Internal Server Error",
      details: e instanceof Error ? e.message : String(e)
    });
  }
});

export default router;

