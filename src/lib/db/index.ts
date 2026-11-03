import "server-only";
// App-wide DB handle. Opens env.DATABASE_PATH, migrates, and seeds on first boot (Render has no persistent disk).
import { join } from "node:path";
import { loadSchoolKeys } from "@/lib/crypto/ed25519";
import { type Env, env } from "@/lib/env";
import { createDb, type Db } from "./client";
import { isSeeded, seed, type SeedSummary } from "./seed";

const globalForDb = globalThis as unknown as { __earmarkDb?: Db };

export function seedOptionsFromEnv(e: Env, now = Date.now()) {
  const keys = loadSchoolKeys(
    { privateKey: e.SCHOOL_PRIVATE_KEY, publicKey: e.SCHOOL_PUBLIC_KEY },
    join(process.cwd(), ".data", "keys", "school.json"),
  );
  return {
    now,
    paypalMode: e.PAYPAL_MODE,
    schoolEmail: e.SCHOOL_PAYPAL_EMAIL,
    lookalikeEmail: e.LOOKALIKE_PAYPAL_EMAIL,
    schoolPublicKey: keys.publicKey,
  };
}

/** Open + migrate, seeding if the DB is empty. Returns the seed summary when it seeded. */
export function openAppDb(path: string, e: Env = env): { db: Db; seeded: SeedSummary | null } {
  const db = createDb(path);
  const seeded = isSeeded(db) ? null : seed(db, seedOptionsFromEnv(e));
  return { db, seeded };
}

/** Lazy singleton (survives Next dev HMR via globalThis). */
export function getDb(): Db {
  globalForDb.__earmarkDb ??= openAppDb(env.DATABASE_PATH).db;
  return globalForDb.__earmarkDb;
}

/** Tests swap in an in-memory DB before calling route handlers. */
export function setDb(db: Db): void {
  globalForDb.__earmarkDb = db;
}
