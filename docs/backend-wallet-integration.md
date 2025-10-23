# Wallet Integration and User Registration Flow

## Overview
This guide describes how the frontend (web-app) authenticates users using Solana wallets via the Solana Wallet Adapter, and how the backend will later register them in PostgreSQL.

The frontend opens a wallet modal, the user authorizes Phantom or Solflare, and the app retrieves the public key. Once backend endpoints are available, the app will POST the wallet address to create a user in Postgres.

## Expected Backend Endpoint

POST `/api/users`

Request body:

```
{
  "wallet_address": "<base58_public_key>"
}
```

### Response

200 OK

```
{
  "user_id": "<uuid>",
  "wallet_address": "<base58_public_key>",
  "created_at": "<iso8601>"
}
```

### Error responses

- 400 Bad Request — invalid payload
- 409 Conflict — wallet already registered (return existing record)
- 5xx — server/database errors

## Data Model (Proposed)

Table: `users`

- `id` UUID PK
- `wallet_address` TEXT UNIQUE NOT NULL
- `created_at` TIMESTAMP WITH TIME ZONE DEFAULT now()

## Future Enhancements

- KYC integration hooks (optional, per jurisdiction)
- Reputation tracking tied to wallet address
- User profiles linked via wallet address (display name, avatar)
- Rate limiting by wallet (abuse prevention)

## Responsibilities

- web-app: handles wallet connect & redirect; sends wallet_address to backend
- actions-server: manages user record creation and idempotency
- core-domain: defines schema, validation, and domain rules

## Security Considerations

- Validate base58 public key format
- Consider signature-based proof-of-ownership for sensitive actions (e.g., signed nonce challenge)
- Store minimal PII; wallet addresses are public keys
- Consider request throttling and observability (metrics, logs)

## Example cURL (to be enabled later)

```
curl -X POST https://api.artha.network/api/users \
  -H 'Content-Type: application/json' \
  -d '{"wallet_address": "<base58_public_key>"}'
```

