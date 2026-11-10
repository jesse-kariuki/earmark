// Deletes a SQLite DB and its WAL files: `node scripts/rm-db.mjs .data/e2e.db` (used before e2e boots its server).
import { rmSync } from "node:fs";

const path = process.argv[2];
if (!path) throw new Error("usage: node scripts/rm-db.mjs <db path>");
for (const suffix of ["", "-wal", "-shm", "-journal"]) rmSync(`${path}${suffix}`, { force: true });
