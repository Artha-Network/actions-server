import { describe, it, expect } from "vitest";
import { parseAmountToUnits, toUsdDecimalString } from "../utils/amount";
import { isBase58Address } from "../utils/validation";
import {
  getInstructionDiscriminator,
  writeUIntLE,
  writeIntLE,
  u16ToBuffer,
  u64ToBuffer,
  i64ToBuffer,
  ANCHOR_DISCRIMINATOR_SIZE,
} from "../solana/anchor";
import { dealIdToBytes, deriveDeterministicDealId, ensureDealId } from "../utils/deal";

// ── amount.ts ───────────────────────────────────────────────────────────────

describe("parseAmountToUnits", () => {
  it("converts integer string", () => {
    expect(parseAmountToUnits("100")).toBe(100_000_000n);
  });

  it("converts decimal string", () => {
    expect(parseAmountToUnits("1.5")).toBe(1_500_000n);
  });

  it("converts 6-decimal string without truncation", () => {
    expect(parseAmountToUnits("0.000001")).toBe(1n);
  });

  it("converts number input", () => {
    expect(parseAmountToUnits(2.5)).toBe(2_500_000n);
  });

  it("throws for invalid format", () => {
    expect(() => parseAmountToUnits("abc")).toThrow("numeric string");
  });

  it("throws for too many decimals", () => {
    expect(() => parseAmountToUnits("1.1234567")).toThrow("numeric string");
  });

  it("handles leading/trailing whitespace", () => {
    expect(parseAmountToUnits("  10  ")).toBe(10_000_000n);
  });
});

describe("toUsdDecimalString", () => {
  it("formats number to 2 decimals", () => {
    expect(toUsdDecimalString(10)).toBe("10.00");
  });

  it("formats string to 2 decimals", () => {
    expect(toUsdDecimalString("10")).toBe("10.00");
  });

  it("truncates to 2 decimal places", () => {
    expect(toUsdDecimalString("10.999")).toBe("10.99");
  });

  it("pads single decimal", () => {
    expect(toUsdDecimalString("5.1")).toBe("5.10");
  });
});

// ── validation.ts ───────────────────────────────────────────────────────────

describe("isBase58Address", () => {
  it("returns true for valid Solana address", () => {
    expect(isBase58Address("CDwBKcVPYAVN4SoyjgPomr9yMD5CN3D69XXmK8ELtgvG")).toBe(true);
  });

  it("returns false for too-short string", () => {
    expect(isBase58Address("abc")).toBe(false);
  });

  it("returns false for string with invalid chars (0, O, I, l)", () => {
    expect(isBase58Address("0OIl" + "A".repeat(40))).toBe(false);
  });

  it("returns false for empty string", () => {
    expect(isBase58Address("")).toBe(false);
  });

  it("returns false for non-string input", () => {
    expect(isBase58Address(123 as any)).toBe(false);
  });
});

// ── anchor.ts ───────────────────────────────────────────────────────────────

describe("getInstructionDiscriminator", () => {
  it("returns 8 bytes", () => {
    const disc = getInstructionDiscriminator("initiate");
    expect(disc.length).toBe(ANCHOR_DISCRIMINATOR_SIZE);
  });

  it("returns deterministic output", () => {
    const a = getInstructionDiscriminator("fund");
    const b = getInstructionDiscriminator("fund");
    expect(a.equals(b)).toBe(true);
  });

  it("different names produce different discriminators", () => {
    const a = getInstructionDiscriminator("fund");
    const b = getInstructionDiscriminator("release");
    expect(a.equals(b)).toBe(false);
  });
});

describe("writeUIntLE / writeIntLE", () => {
  it("u64ToBuffer encodes 1000", () => {
    const buf = u64ToBuffer(1000n);
    expect(buf.length).toBe(8);
    expect(buf.readBigUInt64LE()).toBe(1000n);
  });

  it("u16ToBuffer encodes 250", () => {
    const buf = u16ToBuffer(250);
    expect(buf.length).toBe(2);
    expect(buf.readUInt16LE()).toBe(250);
  });

  it("i64ToBuffer encodes negative value", () => {
    const buf = i64ToBuffer(-1n);
    expect(buf.length).toBe(8);
    expect(buf.readBigInt64LE()).toBe(-1n);
  });

  it("i64ToBuffer encodes positive value", () => {
    const buf = i64ToBuffer(42n);
    expect(buf.readBigInt64LE()).toBe(42n);
  });
});

// ── deal.ts ─────────────────────────────────────────────────────────────────

describe("dealIdToBytes", () => {
  it("converts UUID to 16-byte buffer", () => {
    const uuid = "01234567-89ab-cdef-0123-456789abcdef";
    const buf = dealIdToBytes(uuid);
    expect(buf.length).toBe(16);
    expect(buf.toString("hex")).toBe("0123456789abcdef0123456789abcdef");
  });

  it("throws for wrong-length UUID", () => {
    expect(() => dealIdToBytes("abc")).toThrow("16 bytes");
  });
});

describe("deriveDeterministicDealId", () => {
  it("returns a UUID-like string with dashes", () => {
    const id = deriveDeterministicDealId({ seller: "Alice", buyer: "Bob" });
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
  });

  it("is deterministic", () => {
    const seed = { a: 1, b: 2 };
    expect(deriveDeterministicDealId(seed)).toBe(deriveDeterministicDealId(seed));
  });

  it("is order-independent", () => {
    expect(deriveDeterministicDealId({ b: 2, a: 1 })).toBe(
      deriveDeterministicDealId({ a: 1, b: 2 })
    );
  });
});

describe("ensureDealId", () => {
  it("returns proposed id if given", () => {
    expect(ensureDealId("my-id")).toBe("my-id");
  });

  it("returns deterministic id from seed if no proposal", () => {
    const seed = { x: "y" };
    expect(ensureDealId(null, seed)).toBe(deriveDeterministicDealId(seed));
  });

  it("returns random UUID if no proposal or seed", () => {
    const id = ensureDealId();
    expect(id).toMatch(/^[0-9a-f]{8}-/);
  });
});
