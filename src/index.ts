import express from "express";
import bodyParser from "body-parser";
import { jsonHandler } from "./middleware/json";
import { initiateHandler } from "./routes/initiate";
import { fundHandler } from "./routes/fund";
import { releaseHandler } from "./routes/release";
import { disputeHandler } from "./routes/dispute";

const app = express();
app.use(bodyParser.json());
app.use(jsonHandler);

app.post("/api/escrow/initiate", initiateHandler);
app.post("/api/escrow/fund", fundHandler);
app.post("/api/escrow/release", releaseHandler);
app.post("/api/escrow/dispute", disputeHandler);

export default app;

