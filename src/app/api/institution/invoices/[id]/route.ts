import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { payments } from "@/lib/db/schema";
import { errorJson, okJson } from "@/lib/http/respond";
import { findInvoice } from "@/lib/invoice/intake";

export const dynamic = "force-dynamic";

/** Status for the school console: paid / blocked + reasons. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = getDb();
  const found = findInvoice(db, id);
  if (!found.ok) return errorJson(found.error);
  const inv = found.value;
  const payment = db.select().from(payments).where(eq(payments.invoiceId, id)).get();
  return okJson({
    invoiceId: inv.id,
    invoiceNumber: inv.invoiceNumber,
    amountMinor: inv.amountMinor,
    currency: inv.currency,
    verdict: inv.verdict,
    reasons: inv.reasons,
    paid: payment?.status === "paid_out" && payment.payoutItemId !== null,
    paymentStatus: payment?.status ?? null,
  });
}
