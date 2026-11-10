import "server-only";
// Invoice identity (money rule 5): one file hash → at most one invoice row → at most one payment.
import { sha256HexSync } from "@/lib/crypto/sha256";

/** sha256 of the exact uploaded bytes. Also the fixture key for invoice.extract. */
export function fileHash(bytes: Uint8Array): string {
  return sha256HexSync(bytes);
}
