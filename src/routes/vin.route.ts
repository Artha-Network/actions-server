import { Router, Request, Response } from "express";

const router = Router();

// In-memory cache: VIN → { data, fetchedAt }
const vinCache = new Map<string, { data: NhtsaResult; fetchedAt: number }>();
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

interface NhtsaResult {
  vin: string;
  year: string;
  make: string;
  model: string;
  bodyClass: string;
  errorCode: string;
  valid: boolean;
}

function parseNhtsaResponse(vin: string, raw: any): NhtsaResult {
  const r = raw?.Results?.[0];
  if (!r) {
    return { vin, year: "", make: "", model: "", bodyClass: "", errorCode: "NO_RESULTS", valid: false };
  }
  const errorCode = r.ErrorCode || "";
  // ErrorCode "0" means clean decode. Anything else means partial or failed.
  const hasData = Boolean(r.Make && r.ModelYear);
  return {
    vin,
    year: r.ModelYear || "",
    make: r.Make || "",
    model: r.Model || "",
    bodyClass: r.BodyClass || "",
    errorCode,
    valid: hasData && errorCode === "0",
  };
}

/**
 * GET /api/vin/:vin
 * Proxy to NHTSA vPIC API with 24h cache.
 * Returns year/make/model for a given VIN.
 * Non-blocking: errors return a structured response, never 500.
 */
router.get("/:vin", async (req: Request, res: Response) => {
  const { vin } = req.params;

  if (!vin || vin.length !== 17) {
    return res.status(400).json({
      error: "VIN must be exactly 17 characters",
      vin: vin || "",
      valid: false,
    });
  }

  const upperVin = vin.toUpperCase();

  // Check cache
  const cached = vinCache.get(upperVin);
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
    return res.json({ ...cached.data, cached: true });
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);

    const nhtsaRes = await fetch(
      `https://vpic.nhtsa.dot.gov/api/vehicles/DecodeVinValues/${upperVin}?format=json`,
      { signal: controller.signal }
    );
    clearTimeout(timeout);

    if (!nhtsaRes.ok) {
      console.warn(`[vin] NHTSA returned ${nhtsaRes.status} for ${upperVin}`);
      return res.json({
        vin: upperVin,
        year: "",
        make: "",
        model: "",
        bodyClass: "",
        errorCode: `NHTSA_HTTP_${nhtsaRes.status}`,
        valid: false,
        cached: false,
      });
    }

    const raw = await nhtsaRes.json();
    const result = parseNhtsaResponse(upperVin, raw);

    // Cache even partial results (avoids re-fetching known-bad VINs)
    vinCache.set(upperVin, { data: result, fetchedAt: Date.now() });

    return res.json({ ...result, cached: false });
  } catch (error: unknown) {
    const isTimeout = error instanceof Error && error.name === "AbortError";
    console.warn(`[vin] NHTSA fetch failed for ${upperVin}:`, isTimeout ? "timeout" : error);
    return res.json({
      vin: upperVin,
      year: "",
      make: "",
      model: "",
      bodyClass: "",
      errorCode: isTimeout ? "TIMEOUT" : "FETCH_ERROR",
      valid: false,
      cached: false,
    });
  }
});

export default router;
