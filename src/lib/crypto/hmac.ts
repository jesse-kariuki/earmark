import "server-only";
// HMAC-SHA256 for capability tickets (docs/05-POLICY-GATE.md §4).
import { createHmac, timingSafeEqual } from "node:crypto";

export function hmacSha256Hex(secret: string, message: string): string {
  return createHmac("sha256", secret).update(message).digest("hex");
}

/** Constant-time compare. timingSafeEqual throws on a length mismatch, and length is not secret. */
export function hmacEqual(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}
