import { getDb } from "@/lib/db";
import { findEarmark } from "@/lib/earmarks/service";
import { getEvents } from "@/lib/events/append";
import { describeEvent } from "@/lib/events/describe";
import { errorJson, okJson } from "@/lib/http/respond";

export const dynamic = "force-dynamic";

const TRACE_TYPES = /^(trace\.step|policy\.evaluated|ticket\.|paypal\.|approval\.|invoice\.|remainder\.)/;

/** The trace drawer's lines: decisions, tickets, PayPal calls and agent steps, in plain language. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = getDb();
  const found = findEarmark(db, id);
  if (!found.ok) return errorJson(found.error);
  return okJson(getEvents(db, id).filter((e) => TRACE_TYPES.test(e.type)).map(describeEvent));
}
