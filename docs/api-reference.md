# Actions Server API Reference

Base URL: `/actions`

## POST /actions/initiate

- Creates (or reuses) an escrow deal, derives the PDA, and returns an unsigned Versioned transaction for the seller.
- Request body: `InitiateActionInput` (see `src/types/actions.ts`).

```json
{
  "sellerWallet": "<seller pubkey>",
  "buyerWallet": "<buyer pubkey>",
  "arbiterWallet": "<optional arbiter pubkey>",
  "amount": "125.00",
  "feeBps": 50,
  "deliverBy": 1736899200,
  "disputeDeadline": 1737504000
}
```

Response:

```json
{
  "dealId": "8b2e29e5-87a7-4b89-8e8f-fca44ef2b60d",
  "txMessageBase64": "<base64 message>",
  "latestBlockhash": "H3sh...",
  "lastValidBlockHeight": 243981200,
  "feePayer": "<fee payer pubkey>",
  "nextClientAction": "fund"
}
```

## POST /actions/fund

- Buyer request that builds: create buyer ATA (idempotent), create vault ATA (idempotent), transfer USDC, and invoke the on-chain `fund` instruction.
- Request body: `FundActionInput`.

```json
{
  "dealId": "8b2e29e5-87a7-4b89-8e8f-fca44ef2b60d",
  "buyerWallet": "<buyer pubkey>",
  "amount": "125.00"
}
```

Response mirrors `/actions/initiate` and sets `nextClientAction` to `confirm`.

## POST /actions/release

- Buyer request that triggers the `release` instruction once the deal is funded/resolved.
- Request body: `ReleaseActionInput` ({ dealId, buyerWallet }).
- Response: same envelope with `nextClientAction: "confirm"`.

## POST /actions/refund

- Seller request that triggers the `refund` instruction once the deal is funded/resolved.
- Request body: `RefundActionInput` ({ dealId, sellerWallet }).
- Response: same envelope with `nextClientAction: "confirm"`.

## POST /actions/confirm

- Confirms a submitted signature, records an `onchain_events` row, and transitions the deal state.

```json
{
  "dealId": "8b2e29e5-87a7-4b89-8e8f-fca44ef2b60d",
  "txSig": "5t8...",
  "actorWallet": "<buyer pubkey>",
  "action": "FUND"
}
```

Response:

```json
{
  "deal": {
    "id": "8b2e29e5-87a7-4b89-8e8f-fca44ef2b60d",
    "status": "FUNDED",
    "buyerWallet": "<buyer pubkey>",
    "sellerWallet": "<seller pubkey>",
    "updatedAt": "2025-02-14T12:39:25.201Z",
    "fundedAt": "2025-02-14T12:39:25.201Z"
  }
}
```

## State Machine

```
INIT
  |
  | (confirm FUND)
  v
FUNDED
  |\
  | \--(confirm REFUND)--> REFUNDED
  |
  \--(confirm RELEASE)--> RELEASED
```

- Invalid transitions are rejected with `400` and descriptive errors.
- `/actions/fund`, `/actions/release`, and `/actions/refund` enforce actor wallets based on persisted deal metadata.

### Notes

- All responses include `latestBlockhash`/`lastValidBlockHeight` so the client can resend if needed.
- Sponsored fees are enabled by setting `FEATURE_SPONSORED_FEES=true` and `FEE_PAYER_PUBKEY=<pubkey>`.
- Legacy `/api/escrow/*` endpoints proxy to the new implementations and are considered deprecated.
