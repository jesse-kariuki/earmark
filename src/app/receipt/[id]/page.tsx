import { notFound } from "next/navigation";
import { MoneyBar } from "@/components/MoneyBar";
import { StatusChip } from "@/components/StatusChip";
import { getDb } from "@/lib/db";
import { getEarmarkDetail } from "@/lib/earmarks/service";
import { getEvents } from "@/lib/events/append";
import { env } from "@/lib/env";
import { ChainVerifier } from "./ChainVerifier";

export const dynamic = "force-dynamic";

/** Public Proof Receipt (docs/08): summary + every event with its hash, verified client-side. */
export default async function ReceiptPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = getDb();
  const detail = getEarmarkDetail(db, id);
  if (!detail.ok) notFound();
  const { earmark: e, institution, money } = detail.value;
  const events = getEvents(db, id).map(({ earmarkId, seq, type, actor, payload, createdAt, prevHash, hash }) => ({ earmarkId, seq, type, actor, payload, createdAt, prevHash, hash }));
  const sender = e.senderName.split(" ")[0] ?? e.senderName;

  return (
    <main className="mx-auto max-w-4xl px-4 py-10">
      <p className="text-sm text-muted-foreground">Proof receipt · {e.id}</p>
      <h1 className="mt-1 text-2xl font-semibold tracking-tight">{e.contract.purpose.description}</h1>
      <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
        <StatusChip kind={e.status} />
        <span>
          From {sender} for {e.contract.purpose.beneficiary}, paid only to {institution?.name ?? e.contract.payee.institutionName}
        </span>
      </div>
      <div className="mt-6 rounded-xl border p-5">
        <MoneyBar money={money} currency={e.currency} kesRate={env.KES_DISPLAY_RATE} />
      </div>
      <p className="mt-6 text-sm text-muted-foreground">
        Each event&apos;s hash covers its content and the previous hash. Your browser recomputes all of them now; change one byte anywhere and
        the chain breaks at that event.
      </p>
      <div className="mt-4">
        <ChainVerifier earmarkId={e.id} events={events} judgeMode={env.JUDGE_MODE} />
      </div>
      <p className="mt-4 break-all font-mono text-xs text-muted-foreground">Contract hash {e.contractHash ?? "—"}</p>
    </main>
  );
}
