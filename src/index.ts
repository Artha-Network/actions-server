import express from "express";
import cors from "cors";
import bodyParser from "body-parser";
import cookieParser from "cookie-parser";
import { jsonHandler } from "./middleware/json";
import { initiateHandler } from "./routes/initiate";
import { fundHandler } from "./routes/fund";
import { releaseHandler } from "./routes/release";
import { disputeHandler } from "./routes/dispute";
import userRouter from "./routes/user.route";
import authRouter from "./routes/auth.route";
import sessionRouter from "./routes/session"; // New session route
import actionsRouter from "./routes/actions.route";
import eventsRouter from "./routes/events.route";
import dealsRouter from "./routes/deals.route";
import aiRouter from "./routes/ai.route";

const app = express();

// CORS configuration - allow all localhost ports for development
app.use(cors({
  origin: ['http://localhost:3000', 'http://localhost:8080', 'http://localhost:8081', 'http://localhost:8082', 'http://localhost:5173'],
  credentials: true
}));
app.use(bodyParser.json());
app.use(cookieParser()); // Initialize cookie parser
app.use(jsonHandler);

app.post("/api/escrow/initiate", initiateHandler);
app.post("/api/escrow/fund", fundHandler);
app.post("/api/escrow/release", releaseHandler);
app.post("/api/escrow/dispute", disputeHandler);
app.use("/api/users", userRouter);
app.use("/api/session", sessionRouter); // Mount session router
app.use("/api/events", eventsRouter);
app.use("/api/deals", dealsRouter);
app.use("/api/ai", aiRouter);
app.use("/auth", authRouter);
app.use("/actions", actionsRouter);

export default app;
