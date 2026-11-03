import { z } from "zod";
import { getDb } from "@/lib/db";
import { createEarmark } from "@/lib/earmarks/service";
import { errorJson, fromResult, parseBody, rateLimit } from "@/lib/http/respond";

const Body = z.object({
  sentence: z.string().trim().min(10).max(500),
  contract: z.unknown(),
  senderName: z.string().trim().min(1).max(80),
  recipientName: z.string().trim().min(1).max(80),
});

/** Creates a `draft` Earmark from an approved-by-eye contract. Events: earmark.created, contract.compiled. */
export async function POST(req: Request) {
  const limited = rateLimit(req);
  if (limited) return errorJson(limited);
  const body = await parseBody(req, Body);
  if (!body.ok) return errorJson(body.error);
  return fromResult(createEarmark(getDb(), body.value, Date.now()), 201);
}
