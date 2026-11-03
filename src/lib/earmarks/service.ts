import "server-only";
// Earmark lifecycle before money moves: create (draft) → approve contract (frozen by hash) → pause toggle.
// PayPal steps live in lib/orchestrator/authorize.ts.
import { and, eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { sentenceHash } from "@/lib/contract/compile";
import type { RegistryEntry } from "@/lib/contract/registry";
import { IntentContract } from "@/lib/contract/schema";
import { sha256HexSync } from "@/lib/crypto/sha256";
import type { Db } from "@/lib/db/client";
import { type Earmark, type EarmarkStatus, earmarks, institutions } from "@/lib/db/schema";
import type { AppError } from "@/lib/errors";
import { appendEvent } from "@/lib/events/append";
import { canonicalize } from "@/lib/events/canonical";
import { err, ok, type Result } from "@/lib/result";
import { type MoneyBarNumbers, moneyBar } from "./summary";

export const TERMINAL: readonly EarmarkStatus[] = ["paid", "voided", "expired"];

export function loadRegistry(db: Db): RegistryEntry[] {
  return db
    .select({ id: institutions.id, name: institutions.name, aliases: institutions.aliases, verified: institutions.verified })
    .from(institutions)
    .all();
}

export function findEarmark(db: Db, id: string): Result<Earmark, AppError> {
  const row = db.select().from(earmarks).where(eq(earmarks.id, id)).get();
  return row ? ok(row) : err({ code: "NOT_FOUND", message: `Earmark ${id} not found.` });
}

export interface CreateEarmarkInput {
  sentence: string;
  contract: unknown;
  senderName: string;
  recipientName: string;
}

export function createEarmark(db: Db, input: CreateEarmarkInput, now: number): Result<Earmark, AppError> {
  const parsed = IntentContract.safeParse(input.contract);
  if (!parsed.success) {
    return err({ code: "VALIDATION", message: `Contract is invalid: ${parsed.error.issues[0]?.message ?? "unknown"}` });
  }
  const contract = parsed.data;

  // The payee must be a verified registry institution, chosen by code or by the sender from the verified list.
  const instId = contract.payee.institutionId;
  const inst = instId ? loadRegistry(db).find((r) => r.id === instId) : undefined;
  if (!inst || !inst.verified) {
    return err({ code: "VALIDATION", message: "Choose a verified institution before creating the Earmark." });
  }
  if (Date.parse(contract.expiresAt) <= now) {
    return err({ code: "VALIDATION", message: "The contract has already expired." });
  }

  const id = `em_${nanoid(10)}`;
  return ok(
    db.transaction((tx) => {
      const row = tx
        .insert(earmarks)
        .values({
          id,
          senderName: input.senderName,
          recipientName: input.recipientName,
          sentence: input.sentence,
          contract,
          capMinor: contract.capMinor,
          currency: contract.currency,
          status: "draft",
          expiresAt: new Date(Date.parse(contract.expiresAt)),
          createdAt: new Date(now),
        })
        .returning()
        .get();
      appendEvent(
        tx,
        {
          earmarkId: id,
          type: "earmark.created",
          actor: "sender",
          payload: { senderName: input.senderName, recipientName: input.recipientName, sentence: input.sentence },
        },
        { now },
      );
      appendEvent(
        tx,
        {
          earmarkId: id,
          type: "contract.compiled",
          actor: "system",
          payload: {
            capMinor: contract.capMinor,
            currency: contract.currency,
            institutionId: inst.id,
            evidence: contract.evidence.required,
            approvalThresholdMinor: contract.approvalThresholdMinor,
            period: contract.purpose.period ?? null,
            expiresAt: contract.expiresAt,
            sentenceHash: sentenceHash(input.sentence),
          },
        },
        { now },
      );
      return row;
    }),
  );
}

/** draft → awaiting_authorization. The contract hash freezes it; repeating the call is a no-op. */
export function approveContract(db: Db, id: string, now: number): Result<Earmark, AppError> {
  const found = findEarmark(db, id);
  if (!found.ok) return found;
  const e = found.value;
  if (e.contractHash) return ok(e);
  if (e.status !== "draft") return err({ code: "INVALID_STATE", message: `Earmark is ${e.status}, not draft.` });

  const contractHash = sha256HexSync(canonicalize(e.contract));
  return ok(
    db.transaction((tx) => {
      const row = tx
        .update(earmarks)
        .set({ contractHash, status: "awaiting_authorization" })
        .where(and(eq(earmarks.id, id), eq(earmarks.status, "draft")))
        .returning()
        .get();
      // Lost a race with a concurrent approve: the other call wrote the event; return the current row.
      if (!row) return tx.select().from(earmarks).where(eq(earmarks.id, id)).get()!;
      appendEvent(tx, { earmarkId: id, type: "contract.approved", actor: "sender", payload: { contractHash } }, { now });
      return row;
    }),
  );
}

/** Pause switch. The gate refuses everything while frozen (R01). */
export function setFrozen(db: Db, id: string, frozen: boolean, now: number): Result<Earmark, AppError> {
  const found = findEarmark(db, id);
  if (!found.ok) return found;
  const e = found.value;
  if (TERMINAL.includes(e.status)) return err({ code: "INVALID_STATE", message: `Earmark is ${e.status}.` });
  if (e.frozen === frozen) return ok(e);
  return ok(
    db.transaction((tx) => {
      const row = tx.update(earmarks).set({ frozen }).where(eq(earmarks.id, id)).returning().get()!;
      appendEvent(
        tx,
        { earmarkId: id, type: frozen ? "earmark.frozen" : "earmark.unfrozen", actor: "sender", payload: {} },
        { now },
      );
      return row;
    }),
  );
}

export interface EarmarkDetail {
  earmark: Earmark;
  institution: { id: string; name: string; verified: boolean } | null;
  money: MoneyBarNumbers;
}

export function getEarmarkDetail(db: Db, id: string): Result<EarmarkDetail, AppError> {
  const found = findEarmark(db, id);
  if (!found.ok) return found;
  const e = found.value;
  const instId = e.contract.payee.institutionId;
  const inst = instId
    ? db
        .select({ id: institutions.id, name: institutions.name, verified: institutions.verified })
        .from(institutions)
        .where(eq(institutions.id, instId))
        .get()
    : undefined;
  return ok({ earmark: e, institution: inst ?? null, money: moneyBar(e) });
}
