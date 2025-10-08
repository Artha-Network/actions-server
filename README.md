# actions-server

Solana Actions &amp; Blinks endpoints that return ready-to-sign transactions; owns fee-payer policy.

---

# Actions Server (Solana Actions & Blinks)

Generates **ready-to-sign** base64 transactions for the escrow flow. Also exposes Blink metadata for link-driven UX. Implements **fee-payer** policy for gas-sponsored onboarding.

## Endpoints

- `POST /api/escrow/initiate`
- `POST /api/escrow/fund`
- `POST /api/escrow/release`
- `POST /api/escrow/dispute`
- `GET  /health`

### Example Request

```http
POST /api/escrow/fund
Content-Type: application/json

{
  "dealId": "base58-PDA",
  "buyer": "base58",
  "amount": 2500,
  "useFeePayer": true
}
```

Run

pnpm i
pnpm --filter actions-server dev

```

Build & Start
```

pnpm --filter actions-server build
pnpm --filter actions-server start

```

Environment
| Var                      | Description                 |
| ------------------------ | --------------------------- |
| `RPC_URL`                | Solana RPC                  |
| `PROGRAM_ID`             | Escrow program              |
| `USDC_MINT`              | SPL USDC mint               |
| `FEE_PAYER_SECRET`       | base58 secret for fee-payer |
| `ACTIONS_PUBLIC_BASEURL` | for Blink links             |
| `RATE_LIMIT_PER_MIN`     | anti-abuse                  |

Test
pnpm test       # unit
pnpm test:e2e   # endpoint simulation (requires RPC)
Security

All txs simulate before returning

IP & wallet rate limiting for fee-payer

Strict DTO validation (zod/class-validator)

License

MIT
```
