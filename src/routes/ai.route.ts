import express from "express";
import { z } from "zod";

const router = express.Router();

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
router.post("/generate-contract", async (req, res) => {
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
        const today = new Date().toISOString().split("T")[0];
        return res.status(200).json({
            source: "fallback",
            contract: `# ${d.title ?? "Escrow Agreement"}\n\n**Date:** ${today}\n\n## Parties\n- **Initiator (${d.role ?? "party"}):** Connected wallet\n- **Counterparty:** \`${d.counterparty ?? "Counterparty"}\`\n\n## Agreement\n\n${d.description ?? "As described by the initiating party."}\n\n## Financial Terms\n- **Amount:** ${d.amount ?? "0"} USDC\n- **Held in:** On-chain escrow (Solana)\n\n## Deadlines\n- **Delivery:** ${d.completionDeadline ?? d.deliveryDeadline ?? "As agreed"}\n- **Dispute window:** ${d.disputeDeadline ?? "7"} days after delivery\n\n## Dispute Resolution\nDisputes will be reviewed by the Artha AI arbiter. The arbiter's signed resolution ticket will govern fund release.\n\n---\n*Template contract — AI service is temporarily unavailable. Review all terms before proceeding.*`,
            questions: [
                "Is the description of work complete and unambiguous?",
                "Have both parties agreed to the delivery deadline?",
            ],
        });
    }
});

export default router;
