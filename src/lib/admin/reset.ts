import "server-only";
// Judge-mode reset: drop the SQLite file, migrate, seed, and forget the mock PayPal's memory. Restores any tampering.
import { rmSync } from "node:fs";
import { getDb, openAppDb, setDb } from "@/lib/db";
import { env } from "@/lib/env";
import { orchestrator } from "@/lib/orchestrator";

export function resetDemo(): { earmarks: number } {
  const old = getDb();
  old.$client.close();
  if (env.DATABASE_PATH !== ":memory:") {
    for (const suffix of ["", "-wal", "-shm", "-journal"]) rmSync(`${env.DATABASE_PATH}${suffix}`, { force: true });
  }
  const { db, seeded } = openAppDb(env.DATABASE_PATH);
  setDb(db);
  orchestrator.resetMockPayPal();
  return { earmarks: seeded?.earmarks.length ?? 0 };
}

/** Admin routes run in judge mode, or with the reset token. */
export function adminAllowed(req: Request): boolean {
  return env.JUDGE_MODE || req.headers.get("x-reset-token") === env.DEMO_RESET_TOKEN;
}
