import "dotenv/config";
import app from "./src/index";

const port = Number(process.env.PORT ?? "4000");

app.listen(port, () => {
	// eslint-disable-next-line no-console
	console.log(`[actions-server] listening on http://localhost:${port}`);
});


