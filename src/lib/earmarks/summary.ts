// Money bar numbers (docs/07-UI-SCREENS.md). Isomorphic and pure: the UI and the API compute the same thing.
import type { EarmarkStatus } from "@/lib/db/schema";
import { subMinor } from "@/lib/money";

export interface MoneyBarNumbers {
  capMinor: number;
  heldMinor: number; // still held at PayPal
  sentMinor: number; // captured and paid to the institution
  releasedMinor: number; // returned to the sender
  /** Before authorization: what will be held once the sender approves in PayPal. */
  pendingMinor: number;
}

const HOLDING: readonly EarmarkStatus[] = ["held", "paying", "partially_paid"];
const PRE_AUTH: readonly EarmarkStatus[] = ["draft", "awaiting_authorization"];

export function moneyBar(e: {
  status: EarmarkStatus;
  capMinor: number;
  capturedMinor: number;
  releasedMinor: number;
}): MoneyBarNumbers {
  const heldMinor = HOLDING.includes(e.status) ? subMinor(subMinor(e.capMinor, e.capturedMinor), e.releasedMinor) : 0;
  return {
    capMinor: e.capMinor,
    heldMinor,
    sentMinor: e.capturedMinor,
    releasedMinor: e.releasedMinor,
    pendingMinor: PRE_AUTH.includes(e.status) ? e.capMinor : 0,
  };
}
