import { beforeEach, describe, expect, it } from "vitest";
import { sha256HexSync } from "@/lib/crypto/sha256";
import type { Db } from "@/lib/db/client";
import { appendEvent, getEvents } from "@/lib/events/append";
import { computeEventHash, eventMaterial, sha256Hex, verifyChain } from "@/lib/events/chain";
import { type ChainEvent, GENESIS_HASH } from "@/lib/events/types";
import { fixedNow } from "../helpers/clock";
import { makeTestDb } from "../helpers/db";
import { makeEarmark } from "../helpers/factories";

const MIN = 60_000;

function appendTen(db: Db, earmarkId: string): void {
  const clock = fixedNow();
  for (let i = 0; i < 10; i++) {
    appendEvent(
      db,
      { earmarkId, type: "trace.step", actor: "system", payload: { step: i, amountMinor: 35000 + i, note: `step ${i}` } },
      { now: clock.advance(MIN) },
    );
  }
}

describe("appendEvent + verifyChain", () => {
  let db: Db;
  let earmarkId: string;

  beforeEach(() => {
    db = makeTestDb({ seed: false }).db;
    earmarkId = makeEarmark(db).id;
    appendTen(db, earmarkId);
  });

  it("appends 10 events with seq 0..9 and a valid chain", async () => {
    const events = getEvents(db, earmarkId);
    expect(events.map((e) => e.seq)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
    expect(events[0]!.prevHash).toBe(GENESIS_HASH);
    expect(events[5]!.prevHash).toBe(events[4]!.hash);
    expect(events.every((e) => e.id.startsWith("evt_"))).toBe(true);
    expect(await verifyChain(events)).toEqual({ ok: true, count: 10 });
  });

  it("verifies an empty chain", async () => {
    expect(await verifyChain([])).toEqual({ ok: true, count: 0 });
  });

  it("keeps chains of different earmarks independent", async () => {
    const other = makeEarmark(db).id;
    appendTen(db, other);
    expect(getEvents(db, other)[0]!.prevHash).toBe(GENESIS_HASH);
    expect(await verifyChain(getEvents(db, earmarkId))).toMatchObject({ ok: true, count: 10 });
    expect(await verifyChain(getEvents(db, other))).toMatchObject({ ok: true, count: 10 });
  });

  it("mutating the payload of #5 → hash_mismatch at 5", async () => {
    const events: ChainEvent[] = getEvents(db, earmarkId);
    events[5] = { ...events[5]!, payload: { step: 5, amountMinor: 30000, note: "step 5" } };
    expect(await verifyChain(events)).toMatchObject({ ok: false, brokenAt: 5, reason: "hash_mismatch" });
  });

  it("deleting #5 → seq_gap at 5", async () => {
    const events = getEvents(db, earmarkId).filter((e) => e.seq !== 5);
    expect(await verifyChain(events)).toMatchObject({ ok: false, brokenAt: 5, reason: "seq_gap", expected: "5", actual: "6" });
  });

  it("re-hashing a tampered #5 still breaks the link at #6 → prev_mismatch", async () => {
    const events: ChainEvent[] = getEvents(db, earmarkId);
    const forged = { ...events[5]!, payload: { step: 5, amountMinor: 30000 } };
    events[5] = { ...forged, hash: await computeEventHash(forged) };
    expect(await verifyChain(events)).toMatchObject({ ok: false, brokenAt: 6, reason: "prev_mismatch" });
  });

  it("reordering keys inside a payload still verifies (canonicalization)", async () => {
    const events: ChainEvent[] = getEvents(db, earmarkId);
    const p = events[3]!.payload as Record<string, unknown>;
    events[3] = { ...events[3]!, payload: { note: p.note, amountMinor: p.amountMinor, step: p.step } };
    expect(JSON.stringify(events[3]!.payload)).not.toBe(JSON.stringify(p));
    expect(await verifyChain(events)).toEqual({ ok: true, count: 10 });
  });

  it("tampering directly in SQLite is detected at the edited seq", async () => {
    const sqlite = db.$client;
    // Simulates the M7 admin tamper demo: the only way to change a stored event is to bypass appendEvent AND the trigger.
    sqlite.exec("DROP TRIGGER events_no_update");
    sqlite
      .prepare("UPDATE events SET payload = json_set(payload, '$.amountMinor', 30000) WHERE earmark_id = ? AND seq = 5")
      .run(earmarkId);
    expect(await verifyChain(getEvents(db, earmarkId))).toMatchObject({ ok: false, brokenAt: 5, reason: "hash_mismatch" });
  });

  it("refuses a fractional money amount in a payload and writes nothing", () => {
    expect(() =>
      appendEvent(db, { earmarkId, type: "trace.step", actor: "system", payload: { amountMinor: 350.5 } }),
    ).toThrow(/minor units/);
    expect(getEvents(db, earmarkId)).toHaveLength(10);
  });

  it("the unique (earmark_id, seq) index rejects a forked seq", () => {
    const sqlite = db.$client;
    expect(() =>
      sqlite
        .prepare(
          "INSERT INTO events (id, earmark_id, seq, type, actor, payload, prev_hash, hash, created_at) VALUES ('evt_fork', ?, 3, 'trace.step', 'system', '{}', 'x', 'y', 0)",
        )
        .run(earmarkId),
    ).toThrow(/UNIQUE/);
  });
});

describe("events table is append-only at the DB level", () => {
  it("UPDATE and DELETE are refused by triggers", () => {
    const { db } = makeTestDb({ seed: false });
    const earmarkId = makeEarmark(db).id;
    appendEvent(db, { earmarkId, type: "earmark.created", actor: "sender", payload: {} });
    expect(() => db.$client.prepare("UPDATE events SET type = 'x'").run()).toThrow(/append-only/);
    expect(() => db.$client.prepare("DELETE FROM events").run()).toThrow(/append-only/);
    expect(getEvents(db, earmarkId)).toHaveLength(1);
  });
});

describe("node vs webcrypto SHA-256 parity", () => {
  // Small deterministic PRNG so failures reproduce.
  function rng(seed: number) {
    let s = seed;
    return () => (s = (s * 1103515245 + 12345) % 2 ** 31) / 2 ** 31;
  }

  function randomEvent(r: () => number, i: number): Omit<ChainEvent, "hash"> {
    const pick = <T,>(xs: T[]) => xs[Math.floor(r() * xs.length)]!;
    const word = () => pick(["Brian", "Lakeview", "Ksh", "✓", 'quote"d', "a\nb", "Ünïcødé", "", "🎓"]);
    const payload: Record<string, unknown> = {};
    const keys = 1 + Math.floor(r() * 6);
    for (let k = 0; k < keys; k++) {
      const key = pick(["amountMinor", "invoiceId", "z", "A", "nested", "list", "ok", "nothing"]) + k;
      payload[key] = pick([
        Math.floor(r() * 1e9),
        word(),
        r() > 0.5,
        null,
        { inner: Math.floor(r() * 100), text: word() },
        [Math.floor(r() * 10), word(), null],
      ]);
    }
    return {
      earmarkId: `em_${i}`,
      seq: i,
      type: "trace.step",
      actor: "system",
      payload,
      createdAt: 1_790_000_000_000 + Math.floor(r() * 1e9),
      prevHash: i === 0 ? GENESIS_HASH : sha256HexSync(String(i)),
    };
  }

  it("produces identical hashes for 50 random events", async () => {
    const r = rng(42);
    for (let i = 0; i < 50; i++) {
      const material = eventMaterial(randomEvent(r, i));
      expect(await sha256Hex(material)).toBe(sha256HexSync(material));
    }
  });

  it("matches the known SHA-256 test vector", async () => {
    const abc = "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad";
    expect(await sha256Hex("abc")).toBe(abc);
    expect(sha256HexSync("abc")).toBe(abc);
  });
});
