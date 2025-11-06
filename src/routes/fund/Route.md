# Fund Route

HTTP endpoint to prepare funding of an escrow.

- Type: Route (legacy shim)
- Location: `actions-server/src/routes/fund/index.ts`
- Method: `POST /api/escrow/fund`

## Input

`FundActionInput` — see `actions-server/src/types/actions.ts`

## Output

`ActionResponse` — mirrors `/actions/fund`

### Updates

- v1.0.0 — Initial creation
- v1.1.0 — Structured tx payloads
- v1.2.0 — Proxies to `/actions/fund`
