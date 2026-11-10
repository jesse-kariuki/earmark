import "server-only";
// Throwaway databases for the eval runner and the Attack Lab (docs/09). Each run gets a fresh in-memory DB seeded
// like the app's, plus a `held` Earmark with a labelled fake hold. The real pipeline runs against it, but it cannot
// touch the real ledger, and no attack can reach PayPal: the hold id is not a PayPal authorization.
import type { IntentContract } from "@/lib/contract/schema";
import { sha256HexSync } from "@/lib/crypto/sha256";
import { createDb, type Db } from "@/lib/db/client";
import { seed } from "@/lib/db/seed";
import { earmarks } from "@/lib/db/schema";
import { appendEvent } from "@/lib/events/append";
import { canonicalize } from "@/lib/events/canonical";
import { formatMoney } from "@/lib/money";

const DAY = 24 * 60 * 60 * 1000;

export function createSandboxDb(now: number, schoolEmail: string, lookalikeEmail = "sb-lookalike@personal.example.com"): Db {
  const db = createDb(":memory:");
  seed(db, { now, paypalMode: "mock", schoolEmail, lookalikeEmail, schoolPublicKey: null });
  return db;
}

/** The standard eval contract (docs/09 §1): Lakeview, Brian Kamau, Term 1 2027, cap $400, legacy uploads need approval. */
export function evalContract(now: number, expiresInDays = 3): IntentContract {
  return {
    version: 1,
    purpose: { category: "school_fees", description: "Term 1 2027 fees for Brian Kamau", beneficiary: "Brian Kamau", period: "Term 1 2027" },
    payee: { institutionName: "Lakeview Secondary School", institutionId: "ins_lakeview" },
    capMinor: 40000,
    currency: "USD",
    expiresAt: new Date(now + expiresInDays * DAY).toISOString(),
    evidence: { required: "invoice_and_approval" },
    approvalThresholdMinor: 40000,
    confidenceFloor: 0.85,
    allowPartial: true,
    payInstitutionOnly: true,
    notes: [],
  };
}

export function createHeldEarmark(db: Db, opts: { id: string; contract: IntentContract; now: number; label: string }): string {
  const { id, contract, now, label } = opts;
  const contractHash = sha256HexSync(canonicalize(contract));
  const authorizationId = `${label.toUpperCase()}-HOLD-${id}`;
  db.transaction((tx) => {
    tx.insert(earmarks)
      .values({
        id,
        senderName: "Grace Kamau",
        recipientName: contract.purpose.beneficiary,
        sentence: `Pay ${contract.purpose.beneficiary}'s ${contract.purpose.period ?? ""} fees at ${contract.payee.institutionName}, up to ${formatMoney(contract.capMinor, contract.currency)}.`,
        contract,
        contractHash,
        capMinor: contract.capMinor,
        currency: contract.currency,
        status: "held",
        authorizationId,
        authorizedAt: new Date(now),
        expiresAt: new Date(Date.parse(contract.expiresAt)),
        createdAt: new Date(now),
      })
      .run();
    appendEvent(tx, { earmarkId: id, type: "earmark.created", actor: "sender", payload: { senderName: "Grace Kamau", recipientName: contract.purpose.beneficiary, label } }, { now });
    appendEvent(tx, { earmarkId: id, type: "contract.approved", actor: "sender", payload: { contractHash } }, { now });
    appendEvent(
      tx,
      { earmarkId: id, type: "paypal.authorized", actor: "system", payload: { authorizationId, amountMinor: contract.capMinor, currency: contract.currency, simulated: true } },
      { now },
    );
  });
  return id;
}
