# actions-server

Solana Actions &amp; Blinks endpoints that return ready-to-sign transactions; owns fee-payer policy.

---

# Actions Server (Solana Actions & Blinks)

Generates **ready-to-sign** base64 transactions for the escrow flow. Also exposes Blink metadata for link-driven UX. Implements **fee-payer** policy for gas-sponsored onboarding.

## Endpoints

**Actions API (preferred)**
- `POST /actions/initiate`
- `POST /actions/fund`
- `POST /actions/release`
- `POST /actions/refund`
- `POST /actions/confirm`

**Legacy (deprecated)**
- `POST /api/escrow/initiate`
- `POST /api/escrow/fund`
- `POST /api/escrow/release`
- `POST /api/escrow/dispute`

**Auth & health**
- `POST /auth/upsert-wallet`
- `GET  /health`

### Example Request

```http
POST /actions/fund
Content-Type: application/json

{
  "dealId": "8b2e29e5-87a7-4b89-8e8f-fca44ef2b60d",
  "buyerWallet": "<buyer pubkey>",
  "amount": "125.00"
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
| Var                       | Description                                  |
| ------------------------- | -------------------------------------------- |
| `SOLANA_RPC_URL`          | Solana RPC endpoint (devnet/testnet)         |
| `PROGRAM_ID`              | Escrow program ID                            |
| `USDC_MINT`               | USDC mint used for escrow                    |
| `NEXT_PUBLIC_SOLANA_CLUSTER` | Cluster hint (`devnet`/`testnet`)         |
| `FEATURE_SPONSORED_FEES`  | `true` enables fee sponsorship               |
| `FEE_PAYER_PUBKEY`        | Fee payer public key when sponsorship is on  |
| `ACTIONS_PUBLIC_BASEURL`  | for Blink links                              |
| `RATE_LIMIT_PER_MIN`      | anti-abuse                                   |
| `SUPABASE_URL`            | Supabase project URL                         |
| `SUPABASE_SERVICE_ROLE`   | Supabase service role key (server only)      |
| `DATABASE_URL`            | Postgres connection string (?schema=artha)   |

Test
pnpm test       # unit
pnpm test:e2e   # endpoint simulation (requires RPC)
Security

All txs simulate before returning

IP & wallet rate limiting for fee-payer

Strict DTO validation (zod/class-validator)

## Deal State Machine

```
INIT --(confirm FUND)--> FUNDED --(confirm RELEASE)--> RELEASED
                          |
                          \--(confirm REFUND)--> REFUNDED
```

- `/actions/*` endpoints validate the acting wallet before building transactions.
- `/actions/confirm` persists `onchain_events` records and enforces these transitions.

## Supabase RLS Policies

Row level security SQL files live in `supabase/rls/`:

- `users.sql` — wallets can read their own profile; service role writes.
- `deals.sql` — wallets can read deals where they are buyer or seller.
- `onchain_events.sql` — wallets can read events for their deals.
- `evidence.sql` — wallets can read evidence they uploaded or related deals.

Only the Supabase service role (`SUPABASE_SERVICE_ROLE`) can insert or update on stateful tables; clients use the anon key for read access.

License

MIT
```
