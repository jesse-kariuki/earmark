import { AI_MODE_COOKIE, resolveAiMode } from "@/lib/ai/runtime";
import { getDb } from "@/lib/db";
import { guardAndPay } from "@/lib/flows/pay";
import { errorJson, getCookie, okJson, rateLimit } from "@/lib/http/respond";
import { findInvoice } from "@/lib/invoice/intake";

/** "Ask Guardian": runs the agent; if the gate gives it a ticket, this handler passes it to the orchestrator. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const limited = rateLimit(req);
  if (limited) return errorJson(limited);
  const { id } = await params;
  const found = findInvoice(getDb(), id);
  if (!found.ok) return errorJson(found.error);
  const r = await guardAndPay(id, resolveAiMode(getCookie(req, AI_MODE_COOKIE)));
  return okJson({ guardian: r.guardian, payment: r.payment === null ? null : r.payment.ok ? r.payment.value : { error: r.payment.error } });
}
