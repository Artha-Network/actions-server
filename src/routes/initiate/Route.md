# Initiate Route

HTTP endpoint to initiate a new escrow draft.

- Type: Route
- Location: `actions-server/src/routes/initiate/index.ts`
- Method: `POST /api/escrow/initiate`

## Input
`InitiateEscrowInput` — see `actions-server/src/types/escrow.ts`

## Output
`InitiateEscrowResult` — `{ dealId: string, status: "INITIATED" }`

## Interactions
- Called by web-app feature API
  - File: `web-app/src/features/escrow/api.ts`

### Updates
- v1.0.0 — Initial creation

