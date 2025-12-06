import "dotenv/config";
import { validateEnv } from "./src/lib/validateEnv";

// Validate environment before starting
validateEnv();

import app from "./src/index";

const port = Number(process.env.PORT ?? "4000");

app.listen(port, () => {
	// eslint-disable-next-line no-console
	console.log(`[actions-server] listening on http://localhost:${port}`);
});


