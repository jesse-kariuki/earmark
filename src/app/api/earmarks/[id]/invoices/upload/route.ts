import { join } from "node:path";
import { z } from "zod";
import { AI_MODE_COOKIE, aiRuntime, resolveAiMode } from "@/lib/ai/runtime";
import { getDb } from "@/lib/db";
import { guardAndPay } from "@/lib/flows/pay";
import { errorJson, getCookie, okJson, parseBody, rateLimit } from "@/lib/http/respond";
import { intakeUpload } from "@/lib/invoice/intake";
import { loadSample } from "@/lib/invoice/samples";

const SampleBody = z.object({ sample: z.string().regex(/^[0-9a-z-]{2,40}$/) });

/**
 * Legacy upload: multipart `file`, or JSON `{ sample: "05" }` to send one of the 12 synthetic eval invoices
 * (the demo's "use a sample" buttons). Both go through the same pipeline: extract → crosscheck → gate.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const limited = rateLimit(req);
  if (limited) return errorJson(limited);
  const { id } = await params;

  let bytes: Uint8Array;
  let mime: string;
  if (req.headers.get("content-type")?.startsWith("multipart/form-data")) {
    const form = await req.formData().catch(() => null);
    const file = form?.get("file");
    if (!(file instanceof File)) return errorJson({ code: "VALIDATION", message: "Attach the invoice as `file`." });
    bytes = new Uint8Array(await file.arrayBuffer());
    mime = file.type;
  } else {
    const body = await parseBody(req, SampleBody);
    if (!body.ok) return errorJson(body.error);
    const sample = loadSample(body.value.sample);
    if (!sample) return errorJson({ code: "NOT_FOUND", message: `No sample invoice "${body.value.sample}".` });
    ({ bytes, mime } = sample);
  }

  const mode = resolveAiMode(getCookie(req, AI_MODE_COOKIE));
  const ai = aiRuntime(mode);
  const r = await intakeUpload(getDb(), { earmarkId: id, bytes, mime }, { ai, now: Date.now(), uploadsDir: join(process.cwd(), ".data", "uploads") });
  if (!r.ok) return errorJson(r.error);
  const { invoiceId, stored, gate } = r.value;
  // A blocked invoice is final. Anything else goes to the Guardian (for an upload: it asks the sender to approve).
  const paid = stored && gate.verdict !== "BLOCK" ? await guardAndPay(invoiceId, mode) : null;
  return okJson({ invoiceId, stored, verdict: gate.verdict, firstBlocking: gate.firstBlocking ?? null, results: gate.results, guardian: paid?.guardian ?? null }, 201);
}
