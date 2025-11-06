const DECIMALS = 6;
const SCALE_NUMBER = 10 ** DECIMALS;
const SCALE = BigInt(SCALE_NUMBER);

export function parseAmountToUnits(amount: string | number): bigint {
  if (typeof amount === "number") {
    return BigInt(Math.round(amount * SCALE_NUMBER));
  }
  const trimmed = amount.trim();
  if (!/^\d+(\.\d{1,6})?$/.test(trimmed)) {
    throw new Error("Amount must be a numeric string with up to 6 decimals");
  }
  const [whole, fraction = ""] = trimmed.split(".");
  const fractionPadded = (fraction + "000000").slice(0, DECIMALS);
  return BigInt(whole) * SCALE + BigInt(fractionPadded);
}

export function formatUnitsToDecimal(units: bigint): string {
  const whole = units / SCALE;
  const frac = units % SCALE;
  return `${whole}.${frac.toString().padStart(DECIMALS, "0")}`;
}

export function toUsdDecimalString(amount: string | number): string {
  if (typeof amount === "number") return amount.toFixed(2);
  const [whole, fraction = ""] = amount.split(".");
  const cents = (fraction + "00").slice(0, 2);
  return `${whole}.${cents}`;
}
