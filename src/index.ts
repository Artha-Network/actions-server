import express from "express";
import cors from "cors";
import bodyParser from "body-parser";
import cookieParser from "cookie-parser";
import rateLimit from "express-rate-limit";
import { jsonHandler } from "./middleware/json";
import userRouter from "./routes/user.route";
import authRouter from "./routes/auth.route";
import actionsRouter from "./routes/actions.route";
import eventsRouter from "./routes/events.route";
import dealsRouter from "./routes/deals.route";
import aiRouter from "./routes/ai.route";
import govRouter from "./routes/gov.route";
import notificationsRouter from "./routes/notifications.route";
import vinRouter from "./routes/vin.route";
import { prisma } from "./lib/prisma";

const app = express();
const isProduction = process.env.NODE_ENV === "production";

// Trust proxy — required behind Vercel/reverse proxy for correct client IP in rate limiting
if (isProduction) app.set("trust proxy", 1);

// CORS — needed for direct API access; proxy-based requests (same-origin) bypass CORS
const corsOrigins = process.env.CORS_ORIGINS
  ? process.env.CORS_ORIGINS.split(",").map((o) => o.trim())
  : isProduction
    ? [] // Proxy-based setup doesn't need CORS origins
    : ["http://localhost:3000", "http://localhost:5173", "http://localhost:8080", "http://localhost:8081"];

app.use(cors({ origin: corsOrigins, credentials: true }));
app.use(bodyParser.json({ limit: "1mb" }));
app.use(bodyParser.urlencoded({ limit: "1mb", extended: true }));
app.use(cookieParser());
app.use(jsonHandler);

// Request logger — logs every request with method, path, status, and duration
app.use((req, res, next) => {
  const start = Date.now();
  const wallet = (req.body as Record<string, unknown>)?.callerWallet
    ?? (req.body as Record<string, unknown>)?.sellerWallet
    ?? (req.query?.wallet_address as string)
    ?? "-";
  res.on("finish", () => {
    const ms = Date.now() - start;
    const level = res.statusCode >= 500 ? "ERROR" : res.statusCode >= 400 ? "WARN" : "INFO";
    console.log(`[${level}] ${req.method} ${req.path} ${res.statusCode} ${ms}ms wallet=${wallet}`);
  });
  next();
});

// Rate limiting
const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests, please try again later" },
});

const escrowLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many escrow requests, please try again later" },
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 50,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many auth requests, please try again later" },
});

app.use(generalLimiter);

// Health check (no auth, no rate limit)
app.get("/health", async (_req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.json({ status: "healthy", service: "actions-server", timestamp: new Date().toISOString() });
  } catch {
    res.status(503).json({ status: "unhealthy", service: "actions-server" });
  }
});

// Auth routes (auth rate limit)
app.use("/auth", authLimiter, authRouter);

// Other routes
app.use("/api/users", userRouter);
app.use("/api/events", eventsRouter);
app.use("/api/deals", dealsRouter);
app.use("/api/notifications", notificationsRouter);
app.use("/api/ai", aiRouter);
app.use("/actions", escrowLimiter, actionsRouter);
app.use("/gov", govRouter);
app.use("/api/vin", vinRouter);

// 404 handler
app.use((_req, res) => {
  res.status(404).json({ error: "Not found" });
});

// Global error handler — catches unhandled errors from all routes
app.use((err: Error, req: express.Request, res: express.Response, _next: express.NextFunction) => {
  const status = (err as any).statusCode ?? 500;
  console.error(`[ERROR] ${req.method} ${req.path}:`, err.message);
  if (err.name === "ZodError") {
    return res.status(400).json({ error: "Validation failed", details: (err as any).issues });
  }
  res.status(status).json({ error: status === 500 ? "Internal server error" : err.message });
});

export default app;
