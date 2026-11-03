import { createDb, type Db } from "@/lib/db/client";
import { seed, type SeedOptions, type SeedSummary } from "@/lib/db/seed";
import { fixedNow } from "./clock";

export const TEST_NOW = fixedNow().now();

export const TEST_SEED_OPTIONS: SeedOptions = {
  now: TEST_NOW,
  paypalMode: "mock",
  schoolEmail: "sb-lakeview@business.example.com",
  lookalikeEmail: "sb-lookalike@personal.example.com",
  schoolPublicKey: "dGVzdC1wdWJsaWMta2V5", // not a real key; M6 tests generate their own
};

/** In-memory SQLite, migrated. Seeded unless `seed: false`. */
export function makeTestDb(opts: { seed?: boolean; seedOptions?: Partial<SeedOptions> } = {}): {
  db: Db;
  seeded: SeedSummary | null;
} {
  const db = createDb(":memory:");
  const seeded = opts.seed === false ? null : seed(db, { ...TEST_SEED_OPTIONS, ...opts.seedOptions });
  return { db, seeded };
}
