# Dispute Route

HTTP endpoint to initiate a dispute on a deal.

- Type: Route
- Location: `actions-server/src/routes/dispute/index.ts`
- Method: `POST /api/escrow/dispute`

## Input

`DisputeEscrowInput` — see `actions-server/src/types/escrow.ts`

## Output

`{ ok: true, dealId: string, disputeId: string }`

### Updates

- v1.0.0 — Initial creation
- v1.1.0 — Structured outputs
