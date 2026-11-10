// Node-only half of instrumentation.ts: opening the DB migrates and seeds it on first boot.
import { getDb } from "@/lib/db";

getDb();
