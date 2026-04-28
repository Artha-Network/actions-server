import express from "express";
import rateLimit from "express-rate-limit";
import { z } from "zod";

const router = express.Router();

// Tight per-IP cap for AI endpoints — each call hits Anthropic and burns credits.
// 10 / 15 min is plenty for a real user; protects against retry loops and StrictMode double-mounts.
const aiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 10,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: "Too many AI requests, please wait a few minutes before trying again" },
});

const GenerateContractSchema = z.object({
    title: z.string(),
    role: z.string(),
    counterparty: z.string(),
    amount: z.string(),
    description: z.string().optional(),
    initiatorDeadline: z.string().optional(),
    completionDeadline: z.string().optional(),
    deliveryDeadline: z.string().optional(),
    disputeDeadline: z.string().optional(),
});

// Proxy to Arbiter Service
router.post("/generate-contract", aiLimiter, async (req, res) => {
    try {
        const parsed = GenerateContractSchema.safeParse(req.body);
        if (!parsed.success) {
            return res.status(400).json({ error: parsed.error.message });
        }

        // Call Arbiter Service
        // Assuming Arbiter Service is running on localhost:3001
        const ARBITER_URL = process.env.ARBITER_SERVICE_URL || "http://localhost:3001";
        const headers: Record<string, string> = { "Content-Type": "application/json" };
        if (process.env.ARBITER_ADMIN_KEY) headers["x-admin-key"] = process.env.ARBITER_ADMIN_KEY;

        const response = await fetch(`${ARBITER_URL}/generate-contract`, {
            method: "POST",
            headers,
            body: JSON.stringify(parsed.data),
            signal: AbortSignal.timeout(60_000),
        });

        if (!response.ok) {
            const errText = await response.text().catch(() => response.statusText);
            throw new Error(`Arbiter service error: ${errText}`);
        }

        const data = await response.json();
        return res.status(200).json(data);

    } catch (error) {
        console.warn("[AI] Arbiter service unreachable or failed, returning fallback contract:", error instanceof Error ? error.message : error);
        // Return a template contract so the UI can proceed even when arbiter is down
        const d = req.body as Record<string, string>;
        const esc = (v: unknown) => String(v ?? "")
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#39;");
        const today = new Date().toISOString().split("T")[0];
        const contract = `<article class="contract">
  <h1>${esc(d.title ?? "Escrow Agreement")}</h1>
  <p><strong>Date:</strong> ${today}</p>

  <h2>1. Parties</h2>
  <table>
    <thead><tr><th>Role</th><th>Wallet</th></tr></thead>
    <tbody>
      <tr><td>Initiator (${esc(d.role ?? "party")})</td><td><code>Connected wallet</code></td></tr>
      <tr><td>Counterparty</td><td><code>${esc(d.counterparty ?? "Counterparty")}</code></td></tr>
    </tbody>
  </table>

  <h2>2. Agreement</h2>
  <p>${esc(d.description ?? "As described by the initiating party.")}</p>

  <h2>3. Financial Terms</h2>
  <ul>
    <li><strong>Amount:</strong> ${esc(d.amount ?? "0")} USDC</li>
    <li><strong>Held in:</strong> On-chain escrow (Solana)</li>
  </ul>

  <h2>4. Deadlines</h2>
  <ul>
    <li><strong>Delivery:</strong> ${esc(d.completionDeadline ?? d.deliveryDeadline ?? "As agreed")}</li>
    <li><strong>Dispute window:</strong> ${esc(d.disputeDeadline ?? "7")} days after delivery</li>
  </ul>

  <h2>5. Dispute Resolution</h2>
  <p>Disputes will be reviewed by the Artha AI arbiter. The arbiter's signed resolution ticket will govern fund release.</p>

  <hr />
  <p><em>Template contract — AI service is temporarily unavailable. Review all terms before proceeding.</em></p>
</article>`;
        return res.status(200).json({
            source: "fallback",
            contract,
            questions: [
                "Is the description of work complete and unambiguous?",
                "Have both parties agreed to the delivery deadline?",
            ],
        });
    }
});

export default router;
