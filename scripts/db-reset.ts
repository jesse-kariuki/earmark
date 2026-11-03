// pnpm db:reset — drop the SQLite file, migrate, seed, and verify every seeded chain.
import "dotenv/config";
import { rmSync } from "node:fs";
import { openAppDb } from "@/lib/db";
import { getEvents } from "@/lib/events/append";
import { verifyChain } from "@/lib/events/chain";
import { parseEnv } from "@/lib/env";

async function main() {
  const env = parseEnv(process.env);
  const path = env.DATABASE_PATH;
  for (const suffix of ["", "-wal", "-shm", "-journal"]) rmSync(`${path}${suffix}`, { force: true });

  const { db, seeded } = openAppDb(path, env);
  if (!seeded) throw new Error("db:reset: expected a fresh DB to be seeded");

  let bad = 0;
  for (const id of seeded.earmarks) {
    const result = await verifyChain(getEvents(db, id));
    if (!result.ok) bad++;
    console.log(`  ${id.padEnd(12)} ${result.ok ? `chain ok (${result.count} events)` : `BROKEN at #${result.brokenAt}: ${result.reason}`}`);
  }
  db.$client.close();
  console.log(`db:reset: ${path} · ${seeded.institutions} institutions · ${seeded.earmarks.length} earmarks · mode=${env.PAYPAL_MODE}`);
  if (bad > 0) process.exit(1);
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
