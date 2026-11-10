import "server-only";
// Ed25519 keys for the school (connected mode). Keys travel as base64-encoded PEM (env-friendly, one line).
import { createPrivateKey, createPublicKey, generateKeyPairSync, sign, verify } from "node:crypto";
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

const pem = (b64: string) => Buffer.from(b64, "base64").toString("utf8");

/** Ed25519 signature over `message`, base64. */
export function signEd25519(privateKeyB64: string, message: string | Uint8Array): string {
  return sign(null, Buffer.from(message), createPrivateKey(pem(privateKeyB64))).toString("base64");
}

/** True only for a well-formed key and a signature that verifies. Never throws: bad input is just "not valid". */
export function verifyEd25519(publicKeyB64: string, message: string | Uint8Array, signatureB64: string): boolean {
  try {
    const key = createPublicKey(pem(publicKeyB64));
    if (key.asymmetricKeyType !== "ed25519") return false;
    return verify(null, Buffer.from(message), key, Buffer.from(signatureB64, "base64"));
  } catch {
    return false;
  }
}
