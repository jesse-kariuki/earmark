import { getDb } from "@/lib/db";
import { findEarmark } from "@/lib/earmarks/service";
import { getEvents } from "@/lib/events/append";
import { errorJson, okJson } from "@/lib/http/respond";

export const dynamic = "force-dynamic";

/** Full ordered event chain (public; the receipt page verifies it in the browser). */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = getDb();
  const found = findEarmark(db, id);
  if (!found.ok) return errorJson(found.error);
  return okJson(getEvents(db, id));
}
