import { join } from "node:path";
import { z } from "zod";
import { issueInvoice } from "@/lib/agents/registrar";
import { AI_MODE_COOKIE, resolveAiMode } from "@/lib/ai/runtime";
import { loadSchoolKeys } from "@/lib/crypto/ed25519";
import { getDb } from "@/lib/db";
import { env } from "@/lib/env";
import { submitResponse, submitSignedInvoice } from "@/lib/flows/institution";
import { errorJson, getCookie, okJson, parseBody, rateLimit } from "@/lib/http/respond";

const Body = z.object({
  earmarkRef: z.string().min(1).max(64),
  lineItems: z
    .array(z.object({ label: z.string().trim().min(1).max(120), amountMinor: z.number().int().positive().max(10_000_000) }))
    .min(1)
    .max(30),
  description: z.string().max(200).optional(),
  tamper: z.boolean().optional(),
});

/** Demo helper: the server-side Registrar signs with the school key and submits through the Institution API flow. */
export async function POST(req: Request) {
  const limited = rateLimit(req);
  if (limited) return errorJson(limited);
  const body = await parseBody(req, Body);
  if (!body.ok) return errorJson(body.error);
  const keys = loadSchoolKeys({ privateKey: env.SCHOOL_PRIVATE_KEY, publicKey: env.SCHOOL_PUBLIC_KEY }, join(process.cwd(), ".data", "keys", "school.json"));
  const wire = issueInvoice(getDb(), body.value, keys, Date.now());
  if (!wire.ok) return errorJson(wire.error);
  const r = await submitSignedInvoice(wire.value, resolveAiMode(getCookie(req, AI_MODE_COOKIE)));
  if (!r.ok) return errorJson(r.error);
  return okJson(submitResponse(r.value, { invoiceNumber: wire.value.payload.invoiceNumber }), 201);
}
