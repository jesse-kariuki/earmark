import { z } from "zod";
import { getDb } from "@/lib/db";
import { ledger } from "@/lib/earmarks/ledger";
import { createEarmark } from "@/lib/earmarks/service";
import { errorJson, fromResult, okJson, parseBody, rateLimit } from "@/lib/http/respond";

export const dynamic = "force-dynamic";

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

/** Ledger list: one row per Earmark with money split and counts. `?status=held` filters. */
export async function GET(req: Request) {
  const status = new URL(req.url).searchParams.get("status");
  const { rows, summary } = ledger(getDb());
  return okJson({ rows: status ? rows.filter((r) => r.status === status) : rows, summary });
}
