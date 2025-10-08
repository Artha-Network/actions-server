# EscrowService

Business operations for escrow Actions/Blinks. No HTTP or framework logic.

- Type: Service
- Location: `actions-server/src/services/escrow-service.ts`

## Methods
- `initiate(input: InitiateEscrowInput): Promise<InitiateEscrowResult>`
- `fund(input: FundEscrowInput): Promise<{ ok: true }>`
- `release(input: ReleaseEscrowInput): Promise<{ ok: true }>`
- `dispute(input: DisputeEscrowInput): Promise<{ ok: true }>`

## Interactions
- Consumed by route handlers under `src/routes/*`
- Planned integrations: `onchain-escrow`, `tickets-lib`, `arbiter-service`

### Updates
- v1.0.0 — Initial creation

