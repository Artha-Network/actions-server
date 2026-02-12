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


