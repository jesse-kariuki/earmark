// Hash chain material + verification. Isomorphic: uses WebCrypto (browser and Node ≥ 20), no Node imports.
import { canonicalize } from "./canonical";
import { type ChainEvent, GENESIS_HASH } from "./types";

export type HashInput = Omit<ChainEvent, "hash">;

/** The exact bytes that get hashed for one event. */
export function eventMaterial(e: HashInput): string {
  return canonicalize({
    earmarkId: e.earmarkId,
    seq: e.seq,
    type: e.type,
    actor: e.actor,
    payload: e.payload,
    createdAt: e.createdAt,
    prevHash: e.prevHash,
  });
}

function toHex(buf: ArrayBuffer): string {
  return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, "0")).join("");
}

/** hex(sha256(utf8(str))) via WebCrypto. The server's sync twin lives in append.ts. */
export async function sha256Hex(str: string): Promise<string> {
  const digest = await globalThis.crypto.subtle.digest("SHA-256", new TextEncoder().encode(str));
  return toHex(digest);
}

export async function computeEventHash(e: HashInput): Promise<string> {
  return sha256Hex(eventMaterial(e));
}

export type VerifyFailureReason = "hash_mismatch" | "prev_mismatch" | "seq_gap";

export type VerifyResult =
  | { ok: true; count: number }
  | { ok: false; brokenAt: number; reason: VerifyFailureReason; expected: string; actual: string };

/** Events must be sorted by seq. Reports the first broken event. */
export async function verifyChain(events: readonly ChainEvent[]): Promise<VerifyResult> {
  let prev = GENESIS_HASH;
  for (let i = 0; i < events.length; i++) {
    const e = events[i]!;
    if (e.seq !== i) {
      return { ok: false, brokenAt: i, reason: "seq_gap", expected: String(i), actual: String(e.seq) };
    }
    if (e.prevHash !== prev) {
      return { ok: false, brokenAt: i, reason: "prev_mismatch", expected: prev, actual: e.prevHash };
    }
    const recomputed = await computeEventHash(e);
    if (recomputed !== e.hash) {
      return { ok: false, brokenAt: i, reason: "hash_mismatch", expected: recomputed, actual: e.hash };
    }
    prev = e.hash;
  }
  return { ok: true, count: events.length };
}
