import { describe, it, expect, vi, beforeEach } from "vitest";
import express from "express";
import request from "supertest";

// Mock global fetch
const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

// Import after mocking
import vinRouter from "../routes/vin.route";

const app = express();
app.use("/api/vin", vinRouter);

function nhtsaResponse(make: string, model: string, year: string, errorCode: string) {
  return {
    ok: true,
    json: async () => ({
      Results: [{
        Make: make,
        Model: model,
        ModelYear: year,
        BodyClass: "Sedan",
        ErrorCode: errorCode,
      }],
    }),
  };
}

beforeEach(() => {
  mockFetch.mockReset();
});

describe("GET /api/vin/:vin", () => {
  it("returns 400 for VIN shorter than 17 chars", async () => {
    const res = await request(app).get("/api/vin/ABC123");
    expect(res.status).toBe(400);
    expect(res.body.valid).toBe(false);
    expect(res.body.error).toMatch(/17 characters/);
  });

  it("returns year/make/model for valid VIN", async () => {
    mockFetch.mockResolvedValueOnce(nhtsaResponse("HONDA", "Civic", "2020", "0"));

    const res = await request(app).get("/api/vin/1HGBH41JXMN109186");
    expect(res.status).toBe(200);
    expect(res.body.make).toBe("HONDA");
    expect(res.body.model).toBe("Civic");
    expect(res.body.year).toBe("2020");
    expect(res.body.valid).toBe(true);
    expect(res.body.cached).toBe(false);
  });

  it("returns valid=false when NHTSA ErrorCode is non-zero", async () => {
    mockFetch.mockResolvedValueOnce(nhtsaResponse("", "", "", "6,7,400"));

    const res = await request(app).get("/api/vin/INVALIDVIN1234567");
    expect(res.status).toBe(200);
    expect(res.body.valid).toBe(false);
    expect(res.body.make).toBe("");
  });

  it("handles NHTSA timeout gracefully", async () => {
    mockFetch.mockRejectedValueOnce(Object.assign(new Error("aborted"), { name: "AbortError" }));

    const res = await request(app).get("/api/vin/2T1BURHE0JC039861");
    expect(res.status).toBe(200);
    expect(res.body.valid).toBe(false);
    expect(res.body.errorCode).toBe("TIMEOUT");
  });
});
