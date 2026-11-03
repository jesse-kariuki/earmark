# 08 — Event Log & Proof Receipt

Every Earmark keeps an append-only, hash-chained event log. The public receipt page downloads the events,
recomputes every hash **in the browser**, and shows pass or the first failing event.

## Canonical JSON (`src/lib/events/canonical.ts` — isomorphic, NO Node imports)

Deterministic serialization so server and browser compute identical bytes:
- Objects: keys sorted lexicographically (by UTF-16 code units), recursively.
- No whitespace. Strings via `JSON.stringify`. Numbers: finite only; integers must be safe; any key ending in
  `Minor` (money) must be an integer — throw otherwise. Non-money fractions (e.g. `confidenceFloor: 0.85`) are
  allowed: ECMAScript Number→string is fully specified, so Node and browsers emit identical bytes.
  (Changed in M1: "integers only" made contracts unhashable.) `undefined` keys dropped; `null` kept. Arrays keep order.
- Dates → ISO strings before hashing (store `createdAt` as ms integer in the hashed material).

## Hash

```
material = canonical({ earmarkId, seq, type, actor, payload, createdAt, prevHash })
hash     = hex(sha256(utf8(material)))
prevHash = seq === 0 ? "0".repeat(64) : events[seq-1].hash
```
Server: Node `crypto.createHash("sha256")`. Browser: `crypto.subtle.digest("SHA-256", …)`.
Write `sha256Hex(str): Promise<string>` with both implementations behind one interface and a test that
both produce the same output for 50 random events.

## Append (`src/lib/events/append.ts`)

`appendEvent(db, { earmarkId, type, actor, payload })` inside a transaction: read last event for the
earmark, compute seq/prevHash/hash, insert. Unique `(earmark_id, seq)` prevents forks under concurrency.
Nothing else may write to `events`. Enforced twice: SQLite triggers `events_no_update` / `events_no_delete`
(`drizzle/0001_events_append_only.sql`) abort any UPDATE/DELETE, and `tests/guardrails/events-append-only.test.ts`
fails if any `src/` file other than `append.ts` writes to `events`. The tamper demo must drop + recreate
`events_no_update` inside its own transaction.

`appendEvent` hashes with Node's sync `createHash` (better-sqlite3 transactions cannot await); `verifyChain`
uses WebCrypto. A parity test covers both.

## Verify (`src/lib/events/chain.ts`)

```ts
verifyChain(events): Promise<{ ok: true; count: number } | { ok: false; brokenAt: number; reason: "hash_mismatch" | "prev_mismatch" | "seq_gap" }>
```

## Receipt page

- Server component fetches events + summary; a client component runs `verifyChain` and renders the badge.
- Show each event: `#seq · type · actor · time · hash(8)`; failing one highlighted red with "expected vs got".
- **Tamper demo** (judge mode only): `POST /api/admin/tamper/:earmarkId/:seq` edits one stored payload
  (e.g. amount 35000 → 30000) directly in SQLite *bypassing* `appendEvent`, so the receipt shows the
  failure. Button on the receipt page: "Simulate tampering (demo)". Reset restores it. This is the one
  sanctioned exception to "never update events" and lives in `src/lib/admin/` only.

## Tests

- append 10 events → verify ok.
- mutate payload of #5 → `brokenAt: 5, reason: hash_mismatch`.
- delete #5 → `seq_gap` at 5.
- reorder keys in a payload object → still verifies (canonicalization works).
- node vs browser sha parity (vitest `environment: jsdom` or `happy-dom` with webcrypto).

## Which events get logged (minimum for the happy path)

`earmark.created → contract.compiled → contract.approved → paypal.order_created → paypal.authorized →
invoice.received → invoice.signature_checked | invoice.extracted → policy.evaluated → trace.step(s) →
ticket.issued → ticket.redeemed → paypal.captured → paypal.payout_sent → paypal.payout_succeeded →
remainder.released → recipient.notified → recipient.confirmed`
