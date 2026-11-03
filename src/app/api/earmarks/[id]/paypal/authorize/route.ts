import { z } from "zod";
import { errorJson, fromResult, parseBody, rateLimit } from "@/lib/http/respond";
import { orchestrator } from "@/lib/orchestrator";

const Body = z.object({ orderId: z.string().min(1).max(64) });

/** Authorize the approved order → store authorization id → `held`. Called by the PayPal Buttons' onApprove. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const limited = rateLimit(req);
  if (limited) return errorJson(limited);
  const { id } = await params;
  const body = await parseBody(req, Body);
  if (!body.ok) return errorJson(body.error);
  return fromResult(await orchestrator.authorize(id, body.value.orderId));
}
