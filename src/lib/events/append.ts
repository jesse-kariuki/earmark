import "server-only";
// The ONLY writer of the `events` table (money rule 7). DB triggers refuse UPDATE/DELETE.
import { asc, desc, eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { sha256HexSync } from "@/lib/crypto/sha256";
import type { Db, Tx } from "@/lib/db/client";
import { events } from "@/lib/db/schema";
import { eventMaterial } from "./chain";
import { type Actor, type ChainEvent, type EventType, GENESIS_HASH, type JsonObject } from "./types";

export interface AppendEventInput {
  earmarkId: string;
  type: EventType;
  actor: Actor;
  payload: JsonObject;
}

export type AppendedEvent = ChainEvent & { id: string };

/**
 * Appends one event inside a transaction: read the last event, compute seq/prevHash/hash, insert.
 * The unique (earmark_id, seq) index makes a fork impossible even if two writers race.
 * Pass `now` from an injected clock; defaults to Date.now().
 */
export function appendEvent(db: Db | Tx, input: AppendEventInput, opts: { now?: number } = {}): AppendedEvent {
  const createdAt = opts.now ?? Date.now();
  return db.transaction((tx) => {
    const last = tx
      .select({ seq: events.seq, hash: events.hash })
      .from(events)
      .where(eq(events.earmarkId, input.earmarkId))
      .orderBy(desc(events.seq))
      .limit(1)
      .get();
    const seq = last ? last.seq + 1 : 0;
    const prevHash = last ? last.hash : GENESIS_HASH;
    // eventMaterial canonicalizes the payload, so a float or other non-canonical value throws before insert.
    const hash = sha256HexSync(eventMaterial({ ...input, seq, prevHash, createdAt }));
    const row = { id: `evt_${nanoid(12)}`, ...input, seq, prevHash, hash, createdAt };
    tx.insert(events).values(row).run();
    return row;
  });
}

/** All events for one Earmark, ordered by seq — the shape verifyChain and the receipt page expect. */
export function getEvents(db: Db | Tx, earmarkId: string): AppendedEvent[] {
  return db
    .select({
      id: events.id,
      earmarkId: events.earmarkId,
      seq: events.seq,
      type: events.type,
      actor: events.actor,
      payload: events.payload,
      createdAt: events.createdAt,
      prevHash: events.prevHash,
      hash: events.hash,
    })
    .from(events)
    .where(eq(events.earmarkId, earmarkId))
    .orderBy(asc(events.seq))
    .all();
}
