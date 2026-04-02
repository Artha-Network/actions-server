import { describe, it, expect, vi, beforeAll } from "vitest";
import request from "supertest";

// Mock prisma before importing app
vi.mock("../lib/prisma", () => ({
  prisma: {
    $queryRaw: vi.fn().mockResolvedValue([{ "?column?": 1 }]),
  },
}));

// Mock supabaseAdmin (used by events route)
vi.mock("../lib/supabaseAdmin", () => ({
  default: {
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        order: vi.fn().mockReturnValue({
          limit: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({ data: [], error: null }),
            data: [],
            error: null,
          }),
        }),
      }),
    }),
  },
}));

import app from "../index";
import { prisma } from "../lib/prisma";

describe("App integration", () => {
  describe("GET /health", () => {
    it("returns healthy when DB is reachable", async () => {
      const res = await request(app).get("/health");
      expect(res.status).toBe(200);
      expect(res.body.status).toBe("healthy");
      expect(res.body.service).toBe("actions-server");
      expect(res.body.timestamp).toBeDefined();
    });

    it("returns 503 when DB is unreachable", async () => {
      vi.mocked(prisma.$queryRaw).mockRejectedValueOnce(new Error("DB down"));
      const res = await request(app).get("/health");
      expect(res.status).toBe(503);
      expect(res.body.status).toBe("unhealthy");
    });
  });

  describe("404 handler", () => {
    it("returns 404 JSON for unknown routes", async () => {
      const res = await request(app).get("/this-route-does-not-exist");
      expect(res.status).toBe(404);
      expect(res.body.error).toBe("Not found");
    });
  });

  describe("POST /api/events", () => {
    it("accepts events and returns success (not persisted)", async () => {
      const res = await request(app)
        .post("/api/events")
        .send({ event: "page_view", ts: Date.now() });
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.stored).toBe(false);
    });
  });

  describe("Body parser limits", () => {
    it("accepts JSON up to 1mb", async () => {
      // Small payload should work fine
      const res = await request(app)
        .post("/api/events")
        .send({ data: "x".repeat(1000) });
      expect(res.status).toBe(200);
    });
  });

  describe("Route mounting", () => {
    it("mounts /api/vin routes", async () => {
      // VIN too short → 400 (proves the route is mounted)
      const res = await request(app).get("/api/vin/ABC");
      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/17 characters/);
    });

    it("mounts /gov routes", async () => {
      // GET /gov/titles should attempt to hit the DB (may fail without real DB, but route is mounted)
      const res = await request(app).get("/gov/titles");
      // Could be 200 or 500 depending on mock — but NOT 404
      expect(res.status).not.toBe(404);
    });

    it("mounts /actions routes", async () => {
      // POST without body should return 400 or similar — NOT 404
      const res = await request(app).post("/actions/initiate").send({});
      expect(res.status).not.toBe(404);
    });
  });
});
