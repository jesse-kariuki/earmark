import { AI_MODE_COOKIE, resolveAiMode } from "@/lib/ai/runtime";
import { getDb } from "@/lib/db";
import { guardAndPay } from "@/lib/flows/pay";
import { errorJson, getCookie, okJson, rateLimit } from "@/lib/http/respond";
import { approveInvoice } from "@/lib/invoice/intake";

/** Sender approval → the gate runs again → if ALLOW, the Guardian proposes and the orchestrator pays. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const limited = rateLimit(req);
  if (limited) return errorJson(limited);
  const { id } = await params;
  const r = approveInvoice(getDb(), id, Date.now());
  if (!r.ok) return errorJson(r.error);
  const { gate } = r.value;
  const paid = gate.verdict === "ALLOW" ? await guardAndPay(id, resolveAiMode(getCookie(req, AI_MODE_COOKIE))) : null;
  return okJson({
    invoiceId: id,
    verdict: gate.verdict,
    firstBlocking: gate.firstBlocking ?? null,
    results: gate.results,
    guardian: paid?.guardian ?? null,
    payment: paid?.payment == null ? null : paid.payment.ok ? paid.payment.value : { error: paid.payment.error },
  });
}
