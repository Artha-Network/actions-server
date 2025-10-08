# Fund Route

HTTP endpoint to prepare funding of an escrow.

- Type: Route
- Location: `actions-server/src/routes/fund/index.ts`
- Method: `POST /api/escrow/fund`

## Input

`FundEscrowInput` — see `actions-server/src/types/escrow.ts`

## Output

`FundEscrowResult`

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

### Updates

- v1.0.0 — Initial creation
- v1.1.0 — Structured tx payloads
