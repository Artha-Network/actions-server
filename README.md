# actions-server
Solana Actions &amp; Blinks endpoints that return ready-to-sign transactions; owns fee-payer policy.

---

```md
# Actions Server (Solana Actions & Blinks)

Generates **ready-to-sign** base64 transactions for the escrow flow. Also exposes Blink metadata for link-driven UX. Implements **fee-payer** policy for gas-sponsored onboarding.

## Endpoints
- `POST /actions/initiate`
- `POST /actions/fund`
- `POST /actions/release`
- `POST /actions/refund`
- `GET  /blinks/:dealId/metadata` (preview data)
- `GET  /health`

### Example Request
```http
POST /actions/fund
Content-Type: application/json

Architecture
modules/
  actions/        # controllers + DTOs
  blinks/
  tx/
    builders/     # per-instruction builders using @trust-escrow/solana-kit
    feePayer.service.ts
  webhooks/
  health/
shared/           # logger, errors, guards


{
  "dealId": "base58-PDA",
  "buyer": "base58",
  "amount": 2500,
  "useFeePayer": true
}
