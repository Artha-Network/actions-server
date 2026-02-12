import express from "express";
import { z } from "zod";

const router = express.Router();

const GenerateContractSchema = z.object({
    title: z.string(),
    role: z.string(),
    counterparty: z.string(),
    amount: z.string(),
    description: z.string().optional(),
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
        });

        if (!response.ok) {
            throw new Error(`Arbiter service error: ${response.statusText}`);
        }

        const data = await response.json();
        return res.status(200).json(data);

    } catch (error) {
        console.error("AI Proxy Error:", error);
        return res.status(500).json({ error: "Failed to generate contract" });
    }
});

export default router;
