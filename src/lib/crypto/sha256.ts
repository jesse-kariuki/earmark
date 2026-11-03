import "server-only";
// Sync Node SHA-256. appendEvent needs it because better-sqlite3 transactions cannot await.
// Its async WebCrypto twin (used by the receipt page) is sha256Hex in lib/events/chain.ts; tests prove parity.
import { createHash } from "node:crypto";

export function sha256HexSync(input: string | Uint8Array): string {
  return createHash("sha256").update(input).digest("hex");
}
