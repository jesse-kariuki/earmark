import { and, desc, eq, inArray } from "drizzle-orm";
import Link from "next/link";
import { invoiceChip, StatusChip } from "@/components/StatusChip";
import { SCHOOL_INSTITUTION_ID } from "@/lib/agents/registrar";
import { getDb } from "@/lib/db";
import { earmarks, institutions, invoices, payments } from "@/lib/db/schema";
import { formatMoney } from "@/lib/money";
import { IssueForm } from "./IssueForm";

export const dynamic = "force-dynamic";

export default async function SchoolPage({ searchParams }: { searchParams: Promise<{ ref?: string }> }) {
  const { ref } = await searchParams;
  const db = getDb();
  const school = db.select().from(institutions).where(eq(institutions.id, SCHOOL_INSTITUTION_ID)).get();
  const open = db
    .select()
    .from(earmarks)
    .where(inArray(earmarks.status, ["held", "partially_paid"]))
    .orderBy(desc(earmarks.createdAt))
    .all()
    .filter((e) => e.contract.payee.institutionId === SCHOOL_INSTITUTION_ID);
  const refs = open.map((e) => ({ id: e.id, label: `${e.id} · ${e.recipientName} · ${e.contract.purpose.period ?? e.contract.purpose.description}` }));
  const issued = db
    .select()
    .from(invoices)
    .where(and(eq(invoices.institutionId, SCHOOL_INSTITUTION_ID), eq(invoices.source, "signed")))
    .orderBy(desc(invoices.createdAt))
    .limit(20)
    .all();
  const paid = new Set(
    db
      .select({ invoiceId: payments.invoiceId, itemId: payments.payoutItemId })
      .from(payments)
      .all()
      .filter((p) => p.itemId !== null)
      .map((p) => p.invoiceId),
  );
  const initialRef = ref && refs.some((r) => r.id === ref) ? ref : (refs[0]?.id ?? "");

  return (
    <main className="mx-auto max-w-3xl px-4 py-10">
      <p className="text-sm text-muted-foreground">School console · connected mode</p>
      <h1 className="mt-1 text-2xl font-semibold tracking-tight">{school?.name ?? "Lakeview Secondary School"}</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Issue an invoice signed with the school&apos;s key. No upload and no AI reading: the signature binds every field, and the policy gate
        still checks them all before the Guardian can propose payment.
      </p>

      <div className="mt-6">
        {refs.length === 0 ? (
          <div className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">
            No Earmark is holding money for this school right now. A sender creates one on{" "}
            <Link href="/compose" className="text-primary underline">
              Compose
            </Link>
            .
          </div>
        ) : (
          <IssueForm refs={refs} initialRef={initialRef} />
        )}
      </div>

      <h2 className="mt-10 text-lg font-semibold">Issued invoices</h2>
      {issued.length === 0 ? (
        <p className="mt-2 text-sm text-muted-foreground">Nothing issued yet.</p>
      ) : (
        <ul className="mt-3 divide-y rounded-xl border">
          {issued.map((inv) => (
            <li key={inv.id}>
              <Link href={`/invoices/${inv.id}`} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 hover:bg-muted/50">
                <div>
                  <p className="text-sm font-medium">{inv.invoiceNumber}</p>
                  <p className="text-xs text-muted-foreground">{inv.earmarkId}</p>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-sm tabular-nums">{inv.amountMinor === null ? "—" : formatMoney(inv.amountMinor, inv.currency ?? "USD")}</span>
                  <StatusChip kind={invoiceChip({ ...inv, paid: paid.has(inv.id) })} />
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
      <p className="mt-6 text-xs text-muted-foreground">
        Integrating a school system? See the Institution API:{" "}
        <a href="/openapi.yaml" className="text-primary underline">
          openapi.yaml
        </a>
        .
      </p>
    </main>
  );
}
