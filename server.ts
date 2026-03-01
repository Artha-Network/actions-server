import "dotenv/config";
import { validateEnv } from "./src/lib/validateEnv";

// Validate environment before starting
validateEnv();

import app from "./src/index";
import { prisma } from "./src/lib/prisma";

const port = Number(process.env.PORT ?? "4000");

async function start() {
	try {
		await prisma.$connect();
		// eslint-disable-next-line no-console
		console.log("[actions-server] Database connected.");

		// Apply all missing DB migrations idempotently (cannot use prisma migrate due to my_deals view)

		// 1. Set search path
		await prisma.$executeRawUnsafe(`SET search_path TO artha, public`);

		// 2. Create solana_network enum if missing
		await prisma.$executeRawUnsafe(`
			DO $$
			BEGIN
				IF NOT EXISTS (
					SELECT 1 FROM pg_type t
					INNER JOIN pg_namespace n ON n.oid = t.typnamespace
					WHERE t.typname = 'solana_network' AND n.nspname = 'artha'
				) THEN
					CREATE TYPE artha.solana_network AS ENUM ('devnet', 'testnet');
				END IF;
			END
			$$
		`);

		// 3. Add missing columns to users
		await prisma.$executeRawUnsafe(`ALTER TABLE users ADD COLUMN IF NOT EXISTS wallet_address TEXT`);
		await prisma.$executeRawUnsafe(`ALTER TABLE users ADD COLUMN IF NOT EXISTS network artha.solana_network NOT NULL DEFAULT 'devnet'`);
		await prisma.$executeRawUnsafe(`ALTER TABLE users ADD COLUMN IF NOT EXISTS last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`);
		await prisma.$executeRawUnsafe(`ALTER TABLE users ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`);

		// 4. Backfill wallet_address from wallet_public_key
		await prisma.$executeRawUnsafe(`UPDATE users SET wallet_address = wallet_public_key WHERE wallet_address IS NULL AND wallet_public_key IS NOT NULL`);

		// 5. Add unique constraint on wallet_address (idempotent)
		// Check pg_class (covers both indexes AND constraints) — the old startup code
		// may have created a partial UNIQUE INDEX with this name, so pg_constraint alone
		// is insufficient and would trigger 42P07 on the ADD CONSTRAINT below.
		await prisma.$executeRawUnsafe(`
			DO $$
			BEGIN
				IF NOT EXISTS (
					SELECT 1 FROM pg_class c
					JOIN pg_namespace n ON n.oid = c.relnamespace
					WHERE c.relname = 'users_wallet_address_key'
					AND n.nspname IN ('artha', 'public')
				) THEN
					ALTER TABLE users ADD CONSTRAINT users_wallet_address_key UNIQUE (wallet_address);
				END IF;
			END
			$$
		`);

		// 6. Add missing columns to deals
		await prisma.$executeRawUnsafe(`ALTER TABLE deals ADD COLUMN IF NOT EXISTS seller_wallet TEXT`);
		await prisma.$executeRawUnsafe(`ALTER TABLE deals ADD COLUMN IF NOT EXISTS buyer_wallet TEXT`);
		await prisma.$executeRawUnsafe(`ALTER TABLE deals ADD COLUMN IF NOT EXISTS title TEXT`);
		await prisma.$executeRawUnsafe(`ALTER TABLE deals ADD COLUMN IF NOT EXISTS buyer_email TEXT`);
		await prisma.$executeRawUnsafe(`ALTER TABLE deals ADD COLUMN IF NOT EXISTS seller_email TEXT`);
		await prisma.$executeRawUnsafe(`ALTER TABLE deals ADD COLUMN IF NOT EXISTS funded_at TIMESTAMPTZ`);
		await prisma.$executeRawUnsafe(`ALTER TABLE deals ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`);
		await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS deals_buyer_email_idx ON deals(buyer_email) WHERE buyer_email IS NOT NULL`);
		await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS deals_seller_email_idx ON deals(seller_email) WHERE seller_email IS NOT NULL`);

		// 7. Create onchain_events table if missing
		await prisma.$executeRawUnsafe(`
			CREATE TABLE IF NOT EXISTS onchain_events (
				id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
				deal_id UUID NOT NULL REFERENCES deals(id) ON DELETE CASCADE,
				tx_sig TEXT NOT NULL,
				slot BIGINT NOT NULL,
				instruction TEXT NOT NULL,
				mint TEXT,
				amount NUMERIC(20, 0),
				created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
			)
		`);
		await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS onchain_events_deal_idx ON onchain_events(deal_id)`);

		// 8. Create sessions table if missing
		await prisma.$executeRawUnsafe(`
			CREATE TABLE IF NOT EXISTS sessions (
				id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
				session_id TEXT UNIQUE NOT NULL,
				user_id UUID REFERENCES users(id) ON DELETE CASCADE,
				wallet_address TEXT,
				created_at TIMESTAMPTZ DEFAULT NOW(),
				last_seen TIMESTAMPTZ DEFAULT NOW(),
				expires_at TIMESTAMPTZ NOT NULL,
				ip TEXT,
				user_agent TEXT,
				device_label TEXT
			)
		`);
		await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS sessions_session_id_idx ON sessions(session_id)`);
		await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS sessions_user_id_idx ON sessions(user_id)`);
		await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS sessions_wallet_address_idx ON sessions(wallet_address)`);
		await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS sessions_expires_at_idx ON sessions(expires_at)`);
		await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS sessions_last_seen_idx ON sessions(last_seen)`);
	} catch (e) {
		// eslint-disable-next-line no-console
		console.error("[actions-server] Database connection failed:", e);
		process.exit(1);
	}

	app.listen(port, () => {
		// eslint-disable-next-line no-console
		console.log(`[actions-server] listening on http://localhost:${port}`);
		// eslint-disable-next-line no-console
		console.log(`[actions-server] RPC URL: ${process.env.SOLANA_RPC_URL}`);
	});
}

start();


