import type { MoneyBarNumbers } from "@/lib/earmarks/summary";
import { formatKesEstimate, formatMoney } from "@/lib/money";

// The one visual idea: Held · Sent · Released, always (docs/07-UI-SCREENS.md).
// Segment widths come from integer minor units; percentages are display only.

function pct(part: number, whole: number): string {
  return whole === 0 ? "0%" : `${(part * 100) / whole}%`;
}

export function MoneyBar({
  money,
  currency,
  kesRate,
}: {
  money: MoneyBarNumbers;
  currency: string;
  kesRate?: number;
}) {
  const { capMinor, heldMinor, sentMinor, releasedMinor, pendingMinor } = money;
  const columns = [
    { label: pendingMinor > 0 ? "Will be held" : "Held", value: pendingMinor > 0 ? pendingMinor : heldMinor },
    { label: "Sent", value: sentMinor },
    { label: "Released", value: releasedMinor },
  ];
  return (
    <div className="w-full">
      <div
        className="flex h-3 w-full overflow-hidden rounded-full bg-zinc-100"
        role="img"
        aria-label={`Held ${formatMoney(heldMinor, currency)}, sent ${formatMoney(sentMinor, currency)}, released ${formatMoney(releasedMinor, currency)} of ${formatMoney(capMinor, currency)}`}
      >
        {pendingMinor > 0 && (
          <div className="h-full border-2 border-dashed border-teal-600/60" style={{ width: pct(pendingMinor, capMinor) }} />
        )}
        <div
          className="h-full rounded-l-full border-2 border-teal-700 transition-[width] duration-700"
          style={{ width: pct(heldMinor, capMinor) }}
        />
        <div className="h-full bg-teal-700 transition-[width] duration-700" style={{ width: pct(sentMinor, capMinor) }} />
        <div className="h-full bg-zinc-300 transition-[width] duration-700" style={{ width: pct(releasedMinor, capMinor) }} />
      </div>
      <dl className="mt-3 grid grid-cols-3 gap-2">
        {columns.map((c) => (
          <div key={c.label}>
            <dt className="text-xs text-muted-foreground">{c.label}</dt>
            <dd className="text-xl font-semibold tabular-nums">{formatMoney(c.value, currency)}</dd>
            {kesRate !== undefined && c.value > 0 && (
              <dd className="text-xs tabular-nums text-muted-foreground">{formatKesEstimate(c.value, kesRate)}</dd>
            )}
          </div>
        ))}
      </dl>
    </div>
  );
}
