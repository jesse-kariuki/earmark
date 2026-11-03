import { Ban, Check, CircleDashed, Hand, Hourglass, Loader, Lock, Pause, Undo2 } from "lucide-react";
import type { EarmarkStatus } from "@/lib/db/schema";

// Status chip = icon + word + colour, never colour alone (docs/07-UI-SCREENS.md).
export type ChipKind = EarmarkStatus | "blocked" | "needs_approval" | "paused";

const CHIPS: Record<ChipKind, { label: string; icon: typeof Lock; className: string }> = {
  draft: { label: "Draft", icon: CircleDashed, className: "border-zinc-300 bg-zinc-50 text-zinc-700" },
  awaiting_authorization: { label: "Awaiting PayPal", icon: Hourglass, className: "border-zinc-300 bg-zinc-50 text-zinc-700" },
  held: { label: "Held", icon: Lock, className: "border-teal-300 bg-teal-50 text-teal-800" },
  paying: { label: "Paying", icon: Loader, className: "border-teal-300 bg-teal-50 text-teal-800" },
  partially_paid: { label: "Part paid", icon: Loader, className: "border-teal-300 bg-teal-50 text-teal-800" },
  paid: { label: "Paid", icon: Check, className: "border-teal-700 bg-teal-700 text-white" },
  voided: { label: "Voided", icon: Undo2, className: "border-zinc-300 bg-zinc-100 text-zinc-700" },
  expired: { label: "Expired", icon: Hourglass, className: "border-zinc-300 bg-zinc-100 text-zinc-700" },
  blocked: { label: "Blocked", icon: Ban, className: "border-red-300 bg-red-50 text-red-800" },
  needs_approval: { label: "Needs approval", icon: Hand, className: "border-amber-300 bg-amber-50 text-amber-900" },
  paused: { label: "Paused", icon: Pause, className: "border-amber-300 bg-amber-50 text-amber-900" },
};

export function StatusChip({ kind }: { kind: ChipKind }) {
  const chip = CHIPS[kind];
  const Icon = chip.icon;
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-medium ${chip.className}`}
    >
      <Icon aria-hidden className="size-3.5" />
      {chip.label}
    </span>
  );
}
