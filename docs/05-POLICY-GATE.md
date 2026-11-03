# 05 — Policy Gate, Tickets & Signed Invoices

The gate is the heart of the product. It is **pure**: `evaluate(ctx: GateContext): GateResult`.
No DB, no network, no clock (time is passed in). That makes it trivially unit-testable and is what we
point judges at.

## 1. Types

```ts
export type Verdict = "ALLOW" | "BLOCK" | "REQUIRE_APPROVAL";
export type RuleStatus = "pass" | "fail" | "warn" | "skip";

export interface RuleResult {
  ruleId: RuleId;               // stable id, e.g. "R05_PAYOUT_ACCOUNT_MATCH"
  status: RuleStatus;           // fail → BLOCK, warn → REQUIRE_APPROVAL
  title: string;                // "Payout account matches registry"
  reason: string;               // plain English, includes the compared values
  expected?: string; actual?: string;
}

export interface GateContext {
  now: number;                                  // ms epoch, injected
  earmark: { id; status; frozen; capMinor; capturedMinor; currency; expiresAt; contract: IntentContract };
  invoice: {
    id; source: "signed" | "uploaded"; fileHash; invoiceNumber; amountMinor | null; currency | null;
    payeeName | null; payeeAccount | null; institutionId | null;
    extracted?: ExtractedInvoice; signatureValid?: boolean; lineItemsSumMinor?: number | null;
    containsInstructions?: boolean; approvedBySender?: boolean;
  };
  registry: { byId: Record<string, { name; paypalEmail; verified; publicKey | null }> };
  history: { fileHashes: Set<string>; invoiceNumbers: Set<string> /* `${institutionId}:${number}` */ };
  proposal?: { amountMinor: number };           // set when called via proposePayment
}

export interface GateResult { verdict: Verdict; results: RuleResult[]; firstBlocking?: RuleId }
```

Verdict = `BLOCK` if any `fail`; else `REQUIRE_APPROVAL` if any `warn` and not `approvedBySender`;
else `ALLOW`. Always evaluate **all** rules (the trace shows the full checklist), in the order below.

## 2. Rules (ids are frozen — UI, evals and Attack Lab depend on them)

| Id | Title | Fail / warn condition | Attack it stops |
|---|---|---|---|
| R01_NOT_FROZEN | Earmark not paused | `earmark.frozen` → fail | Pause switch |
| R02_NOT_EXPIRED | Earmark not expired | `now ≥ expiresAt` → fail | **Expired Earmark** |
| R03_FUNDS_HELD | Funds are held | status not in `held`/`partially_paid` → fail | Paying before auth / after void |
| R04_PAYEE_IS_CONTRACT_INSTITUTION | Payee is the contracted institution | `invoice.institutionId !== contract.payee.institutionId` (null counts as mismatch) → fail | Lookalike school |
| R05_PAYOUT_ACCOUNT_MATCH | Payout account matches registry | `normalizeEmail(invoice.payeeAccount) !== registry[contract inst].paypalEmail` → fail | **Swapped payout account** |
| R06_INSTITUTION_VERIFIED | Institution verified in registry | `!registry[id].verified` → fail | Unregistered payee |
| R07_WITHIN_CAP | Amount within remaining cap | `amount > cap - captured` → fail | **Inflated amount** |
| R08_CURRENCY_MATCH | Currency matches | `invoice.currency !== earmark.currency` → fail | Currency trick |
| R09_NOT_DUPLICATE | Invoice not seen before | fileHash in history OR `${inst}:${number}` in history → fail | **Reused invoice** |
| R10_PURPOSE_MATCH | Purpose matches contract | description/period keywords inconsistent with `contract.purpose` (deterministic keyword map per category + period string compare) → warn; clearly different category (e.g. "uniform shop", "transport") → fail | Wrong purpose |
| R11_EVIDENCE_SATISFIED | Required evidence present | `signed_invoice` required but source=uploaded → fail; `invoice_and_approval` → warn until approved | Evidence downgrade |
| R12_SIGNATURE_VALID | School signature valid | source=signed and `!signatureValid` → fail; uploaded → skip | Forged connected invoice |
| R13_NO_EMBEDDED_INSTRUCTIONS | No instructions hidden in invoice | `containsInstructions` → fail | **Prompt injection** |
| R14_ARITHMETIC | Line items add up | `lineItemsSum !== amount` → fail (skip if no line items) | Doctored total |
| R15_EXTRACTION_CONFIDENCE | Extraction confidence ≥ floor | any of {institutionName, payoutAccount, total, invoiceNumber} confidence < floor → warn | Blurry/ambiguous upload |
| R16_APPROVAL_THRESHOLD | Below approval threshold | `amount ≥ approvalThresholdMinor` → warn | Large payments |
| R17_PROPOSAL_MATCHES_INVOICE | Proposal equals invoice amount | `proposal.amountMinor !== invoice.amountMinor` → fail (skip if no proposal) | Agent tries to pay more/less |

Legacy uploads always need human approval unless the contract explicitly allows otherwise — achieved by
R11 (`invoice_and_approval` default for uploads) or R16. Keep that behaviour; it matches the pitch
("legacy mode holds for human approval").

Implementation: `src/lib/policy/rules.ts` exports `RULES: Rule[]` where
`type Rule = { id: RuleId; title: string; check(ctx): Omit<RuleResult,"ruleId"|"title"> }`.
`gate.ts` maps them and folds the verdict.

## 3. Unit tests (`tests/policy/gate.test.ts`)

Build a `baseCtx()` factory for a clean, passing case (connected-mode $350 on a $400 cap). Then, per rule:
- one test where only that rule flips to fail/warn, asserting `verdict` and `firstBlocking === ruleId`;
- one test where it passes.
Plus: "all rules evaluated even after first failure", "approvedBySender converts REQUIRE_APPROVAL→ALLOW
but never BLOCK→ALLOW", "frozen beats everything", property test (fast-check, optional): random amounts
never ALLOW when `amount > cap - captured`.

**Coverage target for `src/lib/policy/**`: 100% lines/branches** (enforce in `vitest.config.ts` thresholds).

## 4. Capability tickets (`src/lib/policy/tickets.ts`)

```ts
issueTicket(ctx, gateResult): Ticket          // only if verdict === "ALLOW"; throws otherwise
// fields: id, earmarkId, invoiceId, amountMinor, currency, payeeEmail (from REGISTRY, not invoice), expiresAt = now+5min
// mac = HMAC-SHA256(env.TICKET_SECRET, canonicalJson(fields))

redeemTicket(ticketId, now): Ticket           // in orchestrator, inside a DB transaction:
//  - row exists, mac recomputes, not expired, redeemedAt null
//  - re-runs gate.evaluate() with fresh context (TOCTOU guard: frozen/expired/duplicate since issue)
//  - sets redeemedAt; inserts payment with ticketId (unique) → second redeem fails on constraint
```
Tests: tampered amount → mac mismatch; expired; double redeem; freeze between issue and redeem → blocked.

Payout destination is **always** `registry[contract.payee.institutionId].paypalEmail` — never the email
printed on an invoice. R05 exists to *detect* the swap and explain it; the ticket design means a swap
could not redirect money even if R05 had a bug. Say this in the README.

## 5. Signed invoices (connected mode)

```ts
export const SignedInvoicePayload = z.object({
  v: z.literal(1),
  institutionId: z.string(),
  invoiceNumber: z.string(),
  earmarkRef: z.string(),           // earmark id the school was given (via recipient/sender share link)
  studentName: z.string(),
  lineItems: z.array(z.object({ label: z.string(), amountMinor: z.number().int() })),
  totalMinor: z.number().int(),
  currency: z.literal("USD"),
  payoutAccount: z.string().email(),
  issuedAt: z.string().datetime(),
  dueDate: z.string(),
});
// wire format: { payload, signature: base64(ed25519_sign(canonicalJson(payload))) , keyId: institutionId }
```
`fileHash` for signed invoices = sha256(canonicalJson(payload)).
Verification: look up `registry[payload.institutionId].publicKey`; `crypto.verify(null, bytes, key, sig)`.
Tests: valid; one byte of payload changed; signed by a different key; unknown institution.

Institution API (also exported as `public/openapi.yaml`, see `06-API-SPEC.md`).
