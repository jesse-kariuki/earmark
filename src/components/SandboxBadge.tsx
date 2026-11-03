import { FlaskConical } from "lucide-react";

/** Money rule 9: every page shows that this runs on PayPal's sandbox with fictional names. */
export function SandboxBadge() {
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full border border-amber-300 bg-amber-50 px-2.5 py-0.5 text-xs font-medium text-amber-900"
      title="PayPal sandbox. No real money moves. All names are fictional."
    >
      <FlaskConical aria-hidden className="size-3.5" />
      Sandbox
    </span>
  );
}
