# Actions Server

Solana Actions & Blinks service for Artha Network. Builds and returns transaction payloads for the UI.

- Source: `src/`
- Routes: `src/routes` (initiate, fund, release, dispute)
- Services: `src/services` (business orchestration, no HTTP)
- Types: `src/types`
- Utils: `src/utils`

## Cross-Repo Interactions
- web-app → actions-server:
  - Web app feature API (UI-only) integrates with `/api/escrow/*` endpoints.
  - File reference: `web-app/src/features/escrow/api.ts`
- actions-server → onchain-escrow (planned):
  - Use Anchor IDL to build tx instructions
- actions-server → arbiter-service (planned):
  - Notify on dispute creation

### Updates
- v1.0.0 — Initial creation

