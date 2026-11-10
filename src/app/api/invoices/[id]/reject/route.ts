import { getDb } from "@/lib/db";
import { errorJson, fromResult, rateLimit } from "@/lib/http/respond";
import { rejectInvoice } from "@/lib/invoice/intake";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const limited = rateLimit(req);
  if (limited) return errorJson(limited);
  const { id } = await params;
  const r = rejectInvoice(getDb(), id, Date.now());
  return fromResult(r.ok ? { ok: true, value: { invoiceId: id, rejected: true } } : r);
}
