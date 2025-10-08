# Actions Server API Reference

Base URL: `/api`

## POST /escrow/initiate

- Description: Create a new escrow draft and return a `dealId`.
- Request body: `InitiateEscrowInput` (see `src/types/escrow.ts`)
- Response: `{ dealId: string, status: "INITIATED" }`
- Used by: web-app (`CreateEscrowPage`, `EscrowFlow`, feature API)

## POST /escrow/fund

- Description: Build fund transaction payload.
- Request: `{ dealId, payer, amount }`
- Response:

```
{
  "kind": "FUND",
  "dealId": "DEAL-XXXXXX",
  "transactionBase64": "<base64>",
  "recentBlockhash": "<blockhash>",
  "feePayer": null,
  "simulation": { "unitsConsumed": 10000, "logs": ["..."] }
}
```

## POST /escrow/release

- Description: Build release transaction payload.
- Request: `{ dealId }`
- Response:

```
{
  "kind": "RELEASE",
  "dealId": "DEAL-XXXXXX",
  "transactionBase64": "<base64>",
  "recentBlockhash": "<blockhash>",
  "feePayer": null,
  "simulation": { "unitsConsumed": 8000, "logs": ["..."] }
}
```

## POST /escrow/dispute

- Description: Open a dispute (notify arbiter-service, build records).
- Request: `{ dealId, reason? }`
- Response: `{ ok: true, dealId: string, disputeId: string }`

### Cross-Component Links

- web-app → actions-server:
  - `web-app/src/features/escrow/api.ts` calls `POST /api/escrow/initiate` (planned; stubbed in web-app).
- actions-server → onchain-escrow (planned):
  - Use program IDL to construct transactions.
- actions-server → arbiter-service (planned):
  - POST dispute events for AI evaluation.

### Updates

- v1.0.0 — Initial creation
