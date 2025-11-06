import { createHash, randomUUID } from "crypto";

export const ANCHOR_DISCRIMINATOR_SIZE = 8;

export function getInstructionDiscriminator(name: string): Buffer {
  const hash = createHash("sha256").update(`global:${name}`).digest();
  return hash.subarray(0, ANCHOR_DISCRIMINATOR_SIZE);
}

export function writeUIntLE(value: bigint, size: number): Buffer {
  const buffer = Buffer.alloc(size);
  let temp = value;
  for (let i = 0; i < size; i += 1) {
    buffer[i] = Number(temp & 0xffn);
    temp >>= 8n;
  }
  return buffer;
}

export function writeIntLE(value: bigint, size: number): Buffer {
  const buffer = Buffer.alloc(size);
  const max = 1n << BigInt(size * 8);
  let temp = value;
  if (value < 0) {
    temp = max + value;
  }
  for (let i = 0; i < size; i += 1) {
    buffer[i] = Number(temp & 0xffn);
    temp >>= 8n;
  }
  return buffer;
}

export function u16ToBuffer(value: number): Buffer {
  return writeUIntLE(BigInt(value), 2);
}

export function u64ToBuffer(value: bigint): Buffer {
  return writeUIntLE(value, 8);
}

export function u128ToBuffer(value: bigint): Buffer {
  return writeUIntLE(value, 16);
}

export function i64ToBuffer(value: bigint): Buffer {
  return writeIntLE(value, 8);
}

export function ensureUuid(value?: string | null): string {
  if (!value) return randomUUID();
  return value;
}
