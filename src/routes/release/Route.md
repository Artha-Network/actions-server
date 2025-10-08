# Release Route

HTTP endpoint to prepare release of funds from escrow.

- Type: Route
- Location: `actions-server/src/routes/release/index.ts`
- Method: `POST /api/escrow/release`

## Input

`ReleaseEscrowInput` — see `actions-server/src/types/escrow.ts`

## Output

`ReleaseEscrowResult`

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

### Updates

- v1.0.0 — Initial creation
- v1.1.0 — Structured tx payloads
