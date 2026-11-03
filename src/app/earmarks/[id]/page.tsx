import { notFound } from "next/navigation";
import Link from "next/link";
import { ContractPanel } from "@/components/ContractPanel";
import { EventTimeline } from "@/components/EventTimeline";
import { MoneyBar } from "@/components/MoneyBar";
import { StatusChip } from "@/components/StatusChip";
import { getDb } from "@/lib/db";
import { getEarmarkDetail, TERMINAL } from "@/lib/earmarks/service";
import { getEvents } from "@/lib/events/append";
import { env } from "@/lib/env";
import { formatMoney } from "@/lib/money";
import { EarmarkTabs } from "./EarmarkTabs";
import { PauseSwitch } from "./PauseSwitch";

export const dynamic = "force-dynamic";

export default async function EarmarkPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = getDb();
  const detail = getEarmarkDetail(db, id);
  if (!detail.ok) notFound();
  const { earmark: e, institution, money } = detail.value;
  const events = getEvents(db, id);
  const terminal = TERMINAL.includes(e.status);

  return (
    <main className="mx-auto max-w-4xl px-4 py-10">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm text-muted-foreground">
            {e.senderName} → {institution?.name ?? e.contract.payee.institutionName}
          </p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">{e.contract.purpose.description}</h1>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <StatusChip kind={e.status} />
            {e.frozen && <StatusChip kind="paused" />}
            <span className="text-sm tabular-nums text-muted-foreground">Cap {formatMoney(e.capMinor, e.currency)}</span>
          </div>
        </div>
        {!terminal && <PauseSwitch earmarkId={e.id} initial={e.frozen} />}
      </div>

      <div className="mt-8 rounded-xl border p-5">
        <MoneyBar money={money} currency={e.currency} kesRate={env.KES_DISPLAY_RATE} />
      </div>

      <nav aria-label="Share" className="mt-4 flex flex-wrap gap-x-4 gap-y-1 text-sm">
        <Link className="text-primary underline-offset-4 hover:underline" href={`/r/${e.id}`}>
          Recipient view
        </Link>
        <Link className="text-primary underline-offset-4 hover:underline" href={`/receipt/${e.id}`}>
          Proof receipt
        </Link>
        <Link className="text-primary underline-offset-4 hover:underline" href={`/school?ref=${e.id}`}>
          School link
        </Link>
      </nav>

      <EarmarkTabs
        timeline={<EventTimeline events={events} />}
        invoices={
          <div className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">
            No invoices yet. The school sends a signed invoice, or you upload one, and every rule is checked before
            anything is paid.
          </div>
        }
        contract={
          <div className="space-y-3">
            <ContractPanel contract={e.contract} institutionName={institution?.name} />
            <p className="text-xs text-muted-foreground">
              Sentence: “{e.sentence}”
              <br />
              Contract hash: <code className="font-mono">{e.contractHash ?? "not approved yet"}</code>
            </p>
          </div>
        }
      />
    </main>
  );
}
