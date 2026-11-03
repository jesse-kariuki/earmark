import { z } from "zod";
import { getDb } from "@/lib/db";
import { setFrozen } from "@/lib/earmarks/service";
import { errorJson, fromResult, parseBody, rateLimit } from "@/lib/http/respond";

const Body = z.object({ frozen: z.boolean() });

/** Pause switch: while frozen the gate refuses every payment (R01). */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const limited = rateLimit(req);
  if (limited) return errorJson(limited);
  const { id } = await params;
  const body = await parseBody(req, Body);
  if (!body.ok) return errorJson(body.error);
  return fromResult(setFrozen(getDb(), id, body.value.frozen, Date.now()));
}
