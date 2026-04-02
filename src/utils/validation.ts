const BASE58_REGEX = /^[1-9A-HJ-NP-Za-km-z]+$/;

export function isBase58Address(addr: string): boolean {
  return typeof addr === "string" && addr.length >= 32 && addr.length <= 44 && BASE58_REGEX.test(addr);
}


