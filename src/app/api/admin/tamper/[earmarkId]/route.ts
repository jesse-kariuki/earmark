import { z } from "zod";
import { adminAllowed } from "@/lib/admin/reset";
import { pickTamperTarget, tamperEvent } from "@/lib/admin/tamper";
import { getDb } from "@/lib/db";
import { errorJson, fromResult, parseBody, rateLimit } from "@/lib/http/respond";

const Body = z.object({ seq: z.number().int().nonnegative().optional() });

/** Tamper demo: edit one stored event so the receipt shows the chain breaking there. Reset restores it. */
export async function POST(req: Request, { params }: { params: Promise<{ earmarkId: string }> }) {
  const limited = rateLimit(req);
  if (limited) return errorJson(limited);
  if (!adminAllowed(req)) return errorJson({ code: "INVALID_STATE", message: "Tampering is only available in judge mode." });
  const { earmarkId } = await params;
  const body = await parseBody(req, Body);
  if (!body.ok) return errorJson(body.error);
  const db = getDb();
  const seq = body.value.seq ?? pickTamperTarget(db, earmarkId);
  if (seq === null) return errorJson({ code: "NOT_FOUND", message: "This Earmark has no events." });
  return fromResult(tamperEvent(db, earmarkId, seq));
}
