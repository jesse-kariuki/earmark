import type { IntentContract } from "@/lib/contract/schema";
import type { Db } from "@/lib/db/client";
import { type Earmark, earmarks, type NewEarmark } from "@/lib/db/schema";
import { TEST_NOW } from "./db";

const DAY = 24 * 60 * 60 * 1000;

export function makeContract(overrides: Partial<IntentContract> = {}): IntentContract {
  return {
    version: 1,
    purpose: {
      category: "school_fees",
      description: "Term 1 2027 fees for Brian Kamau",
      beneficiary: "Brian Kamau",
      period: "Term 1 2027",
    },
    payee: { institutionName: "Lakeview Secondary School", institutionId: "ins_lakeview" },
    capMinor: 40000,
    currency: "USD",
    expiresAt: new Date(TEST_NOW + 3 * DAY).toISOString(),
    evidence: { required: "invoice_any" },
    approvalThresholdMinor: 40000,
    confidenceFloor: 0.85,
    allowPartial: true,
    payInstitutionOnly: true,
    notes: [],
    ...overrides,
  };
}

let n = 0;

/** Inserts an Earmark row (no events) and returns it. */
export function makeEarmark(db: Db, overrides: Partial<NewEarmark> = {}): Earmark {
  const contract = overrides.contract ?? makeContract();
  const row: NewEarmark = {
    id: `em_test_${++n}`,
    senderName: "Grace Kamau",
    recipientName: "Brian Kamau",
    sentence: "Pay Brian's Term 1 fees at Lakeview Secondary School, up to $400.",
    contract,
    capMinor: contract.capMinor,
    currency: contract.currency,
    status: "held",
    expiresAt: new Date(Date.parse(contract.expiresAt)),
    createdAt: new Date(TEST_NOW),
    ...overrides,
  };
  return db.insert(earmarks).values(row).returning().get();
}
