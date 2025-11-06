-- Wallet identity + deal instrumentation (additive)
SET search_path TO artha, public;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_type t
      INNER JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE t.typname = 'solana_network'
      AND n.nspname = 'artha'
  ) THEN
    CREATE TYPE solana_network AS ENUM ('devnet', 'testnet');
  END IF;
END
$$;

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS wallet_address text,
  ADD COLUMN IF NOT EXISTS network solana_network NOT NULL DEFAULT 'devnet',
  ADD COLUMN IF NOT EXISTS last_seen_at timestamptz NOT NULL DEFAULT now();

UPDATE users
SET wallet_address = wallet_public_key
WHERE wallet_address IS NULL
  AND wallet_public_key IS NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'users_wallet_address_key'
      AND conrelid = 'users'::regclass
  ) THEN
    ALTER TABLE users
      ADD CONSTRAINT users_wallet_address_key UNIQUE (wallet_address);
  END IF;
END
$$;

ALTER TABLE deals
  ADD COLUMN IF NOT EXISTS seller_wallet text,
  ADD COLUMN IF NOT EXISTS buyer_wallet text;

UPDATE deals
SET seller_wallet = u_s.wallet_address
FROM users u_s
WHERE u_s.id = deals.seller_id
  AND deals.seller_wallet IS NULL;

UPDATE deals
SET buyer_wallet = u_b.wallet_address
FROM users u_b
WHERE u_b.id = deals.buyer_id
  AND deals.buyer_wallet IS NULL;

CREATE TABLE IF NOT EXISTS onchain_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  deal_id uuid NOT NULL REFERENCES deals(id) ON DELETE CASCADE,
  tx_sig text NOT NULL,
  slot bigint NOT NULL,
  instruction text NOT NULL,
  mint text,
  amount numeric(20, 0),
  created_at timestamptz NOT NULL DEFAULT now()
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_indexes
    WHERE schemaname = 'artha'
      AND tablename = 'onchain_events'
      AND indexname = 'onchain_events_deal_idx'
  ) THEN
    CREATE INDEX onchain_events_deal_idx ON onchain_events (deal_id);
  END IF;
END
$$;
