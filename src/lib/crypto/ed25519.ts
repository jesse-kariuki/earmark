import "server-only";
// Ed25519 keys for the school (connected mode). Keys travel as base64-encoded PEM (env-friendly, one line).
// M1 needs only key generation/loading for the seed; M6 adds sign/verify of invoice payloads.
import { generateKeyPairSync } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

export interface KeyPairB64 {
  privateKey: string; // base64(PKCS#8 PEM)
  publicKey: string; // base64(SPKI PEM)
}

export function generateEd25519KeyPair(): KeyPairB64 {
  const { privateKey, publicKey } = generateKeyPairSync("ed25519", {
    privateKeyEncoding: { type: "pkcs8", format: "pem" },
    publicKeyEncoding: { type: "spki", format: "pem" },
  });
  return {
    privateKey: Buffer.from(privateKey).toString("base64"),
    publicKey: Buffer.from(publicKey).toString("base64"),
  };
}

/**
 * School keypair: SCHOOL_PRIVATE_KEY/SCHOOL_PUBLIC_KEY env if both set, else the dev pair in `file`
 * (gitignored `.data/keys/school.json`), generating it on first use.
 */
export function loadSchoolKeys(
  envKeys: { privateKey?: string; publicKey?: string },
  file: string,
): KeyPairB64 & { source: "env" | "file" | "generated" } {
  if (envKeys.privateKey && envKeys.publicKey) {
    return { privateKey: envKeys.privateKey, publicKey: envKeys.publicKey, source: "env" };
  }
  if (existsSync(file)) {
    const parsed = JSON.parse(readFileSync(file, "utf8")) as KeyPairB64;
    return { ...parsed, source: "file" };
  }
  const pair = generateEd25519KeyPair();
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, JSON.stringify(pair, null, 2), { mode: 0o600 });
  return { ...pair, source: "generated" };
}
