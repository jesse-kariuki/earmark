import { getDb } from "@/lib/db";
import { errorJson, okJson, rateLimit } from "@/lib/http/respond";
import { approveInvoice } from "@/lib/invoice/intake";

/** Sender approval → the gate runs again. An ALLOW only makes the invoice payable; the gate decides again at payment. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const limited = rateLimit(req);
  if (limited) return errorJson(limited);
  const { id } = await params;
  const r = approveInvoice(getDb(), id, Date.now());
  if (!r.ok) return errorJson(r.error);
  const { gate } = r.value;
  return okJson({ invoiceId: id, verdict: gate.verdict, firstBlocking: gate.firstBlocking ?? null, results: gate.results });
}
