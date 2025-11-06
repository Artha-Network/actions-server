/**
 * Auth Route
 * Handles wallet identity upsert requests.
 */
import express from "express";
import { upsertWalletIdentity, WalletNetwork } from "../services/user.service";
import { isBase58Address } from "../utils/validation";

const router = express.Router();

const isSupportedNetwork = (network: unknown): network is WalletNetwork =>
  network === "devnet" || network === "testnet";

router.post("/upsert-wallet", async (req, res) => {
  const { walletAddress, network } = req.body ?? {};

  if (!isBase58Address(walletAddress)) {
    return res.status(400).json({ error: "Invalid walletAddress" });
  }

  if (!isSupportedNetwork(network)) {
    return res.status(400).json({ error: "Unsupported network" });
  }

  try {
    const result = await upsertWalletIdentity(walletAddress, network);
    return res.json(result);
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error("/auth/upsert-wallet error", error);
    return res.status(500).json({ error: "Internal Server Error" });
  }
});

export default router;
