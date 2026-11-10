import { AI_MODE_COOKIE, resolveAiMode } from "@/lib/ai/runtime";
import { submitResponse, submitSignedInvoice } from "@/lib/flows/institution";
import { errorJson, getCookie, okJson, parseBody, rateLimit } from "@/lib/http/respond";
import { SignedInvoiceWire } from "@/lib/invoice/signed";

/** Institution API: a school posts a signed invoice. Verified → gate → the Guardian pays if every rule passes. */
export async function POST(req: Request) {
  const limited = rateLimit(req);
  if (limited) return errorJson(limited);
  const body = await parseBody(req, SignedInvoiceWire);
  if (!body.ok) return errorJson(body.error);
  const r = await submitSignedInvoice(body.value, resolveAiMode(getCookie(req, AI_MODE_COOKIE)));
  if (!r.ok) return errorJson(r.error);
  return okJson(submitResponse(r.value), 201);
}
