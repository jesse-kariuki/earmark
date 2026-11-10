import "server-only";
// Judge-mode tamper demo (docs/08-PROOF-RECEIPT.md): edits ONE stored event payload directly in SQLite, bypassing
// appendEvent, so the receipt page shows the chain breaking at exactly that event. This is the one sanctioned exception
// to "never update events": it drops the append-only trigger, edits, and recreates the trigger in one transaction.
import { and, asc, eq } from "drizzle-orm";
import type { Db } from "@/lib/db/client";
import { events } from "@/lib/db/schema";
import type { AppError } from "@/lib/errors";
import { err, ok, type Result } from "@/lib/result";

const NO_UPDATE_TRIGGER = "CREATE TRIGGER `events_no_update` BEFORE UPDATE ON `events` BEGIN SELECT RAISE(ABORT, 'events are append-only'); END;";

/** The most telling event to tamper with: the capture amount if there is one, else any amount, else the last event. */
export function pickTamperTarget(db: Db, earmarkId: string): number | null {
  const rows = db.select({ seq: events.seq, type: events.type, payload: events.payload }).from(events).where(eq(events.earmarkId, earmarkId)).orderBy(asc(events.seq)).all();
  if (rows.length === 0) return null;
  const withAmount = (r: (typeof rows)[number]) => typeof (r.payload as { amountMinor?: unknown }).amountMinor === "number";
  return (rows.find((r) => r.type === "paypal.captured") ?? rows.find(withAmount) ?? rows.at(-1)!).seq;
}

export function tamperEvent(db: Db, earmarkId: string, seq: number): Result<{ seq: number; field: string; from: unknown; to: unknown }, AppError> {
  const row = db.select().from(events).where(and(eq(events.earmarkId, earmarkId), eq(events.seq, seq))).get();
  if (!row) return err({ code: "NOT_FOUND", message: `Event #${seq} not found on ${earmarkId}.` });
  const payload = { ...(row.payload as Record<string, unknown>) };
  let field: string;
  let from: unknown;
  if (typeof payload.amountMinor === "number") {
    field = "amountMinor";
    from = payload.amountMinor;
    payload.amountMinor = Math.max(0, payload.amountMinor - 5000); // e.g. $350 → $300
  } else {
    field = "tampered";
    from = undefined;
    payload.tampered = true;
  }
  const sqlite = db.$client;
  sqlite.transaction(() => {
    sqlite.exec("DROP TRIGGER IF EXISTS `events_no_update`;");
    sqlite.prepare("UPDATE events SET payload = ? WHERE earmark_id = ? AND seq = ?").run(JSON.stringify(payload), earmarkId, seq);
    sqlite.exec(NO_UPDATE_TRIGGER);
  })();
  return ok({ seq, field, from: from ?? null, to: payload[field] });
}
