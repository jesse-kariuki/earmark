import "server-only";
// The Institution API flow: signed invoice → verify + gate → (if not blocked) Guardian → orchestrator.
import type { AiMode } from "@/lib/ai/call";
import { getDb } from "@/lib/db";
import type { AppError } from "@/lib/errors";
import { intakeSigned, type SignedOutcome } from "@/lib/invoice/intake";
import type { SignedInvoiceWire } from "@/lib/invoice/signed";
import { err, ok, type Result } from "@/lib/result";
import { type GuardAndPayResult, guardAndPay } from "./pay";

export type SubmitResult = SignedOutcome & { paid: GuardAndPayResult | null };

export async function submitSignedInvoice(wire: SignedInvoiceWire, mode: AiMode): Promise<Result<SubmitResult, AppError>> {
  const r = intakeSigned(getDb(), wire, Date.now());
  if (!r.ok) return r;
  const { stored, gate } = r.value;
  if (!stored && gate.results.some((x) => x.ruleId === "R09_NOT_DUPLICATE" && x.status === "fail")) {
    return err({ code: "CONFLICT_DUPLICATE", message: "This invoice was already submitted.", detail: { ruleIds: ["R09_NOT_DUPLICATE"] } });
  }
  const paid = stored && gate.verdict !== "BLOCK" ? await guardAndPay(r.value.invoiceId, mode) : null;
  return ok({ ...r.value, paid });
}

/** The JSON both institution routes return. */
export function submitResponse(r: SubmitResult, extra: Record<string, unknown> = {}) {
  const { invoiceId, stored, signatureValid, gate, paid } = r;
  return {
    invoiceId: stored ? invoiceId : null,
    ...extra,
    signatureValid,
    verdict: gate.verdict,
    firstBlocking: gate.firstBlocking ?? null,
    results: gate.results,
    guardian: paid?.guardian ?? null,
    payment: paid?.payment == null ? null : paid.payment.ok ? paid.payment.value : { error: paid.payment.error },
  };
}
