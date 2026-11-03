import type { ChainEvent } from "@/lib/events/types";

// Compact event list with truncated hashes (docs/07-UI-SCREENS.md). The receipt page adds verification (M7).

const LABELS: Record<string, string> = {
  "earmark.created": "Earmark created",
  "contract.compiled": "Contract compiled",
  "contract.approved": "Contract approved and frozen",
  "paypal.order_created": "PayPal order created",
  "paypal.authorized": "Money held at PayPal",
  "earmark.frozen": "Paused",
  "earmark.unfrozen": "Resumed",
  "trace.step": "AI step",
};

function time(ms: number): string {
  return new Date(ms).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

export function EventTimeline({ events }: { events: readonly ChainEvent[] }) {
  if (events.length === 0) return <p className="text-sm text-muted-foreground">No events yet.</p>;
  return (
    <ol className="space-y-1">
      {events.map((e) => (
        <li key={e.seq} className="grid grid-cols-[2.5rem_1fr_auto] items-baseline gap-2 rounded-md px-2 py-1.5 text-sm odd:bg-muted/50">
          <span className="font-mono text-xs text-muted-foreground">#{e.seq}</span>
          <span>
            {LABELS[e.type] ?? e.type} <span className="text-xs text-muted-foreground">· {e.actor}</span>
          </span>
          <span className="flex items-baseline gap-3">
            <span className="text-xs tabular-nums text-muted-foreground">{time(e.createdAt)}</span>
            <code className="font-mono text-xs text-muted-foreground" title={e.hash}>
              {e.hash.slice(0, 8)}
            </code>
          </span>
        </li>
      ))}
    </ol>
  );
}
