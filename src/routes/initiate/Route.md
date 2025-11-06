# Initiate Route

HTTP endpoint to initiate a new escrow draft.

- Type: Route (legacy shim)
- Location: `actions-server/src/routes/initiate/index.ts`
- Method: `POST /api/escrow/initiate`

## Input
`InitiateActionInput` — see `actions-server/src/types/actions.ts`

## Output
`ActionResponse` — matches `/actions/initiate`

## Interactions
- Called by web-app feature API
  - File: `web-app/src/features/escrow/api.ts`

### Updates
- v1.0.0 — Initial creation
- v1.1.0 — Proxies to `/actions/initiate`
