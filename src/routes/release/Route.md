# Release Route

HTTP endpoint to prepare release of funds from escrow.

- Type: Route (legacy shim)
- Location: `actions-server/src/routes/release/index.ts`
- Method: `POST /api/escrow/release`

## Input

`ReleaseActionInput` — see `actions-server/src/types/actions.ts`

## Output

`ActionResponse` — mirrors `/actions/release`

### Updates

- v1.0.0 — Initial creation
- v1.1.0 — Proxies to `/actions/release`
- v1.1.0 — Structured tx payloads
