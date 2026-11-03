import { z } from "zod";
import { AI_MODE_COOKIE, aiRuntime, resolveAiMode } from "@/lib/ai/runtime";
import { compileContract } from "@/lib/contract/compile";
import { getDb } from "@/lib/db";
import { loadRegistry } from "@/lib/earmarks/service";
import { errorJson, getCookie, okJson, parseBody, rateLimit } from "@/lib/http/respond";

const Body = z.object({ sentence: z.string().trim().min(10).max(500) });

/** Sentence → draft contract + resolution warnings. No DB write. */
export async function POST(req: Request) {
  const limited = rateLimit(req);
  if (limited) return errorJson(limited);
  const body = await parseBody(req, Body);
  if (!body.ok) return errorJson(body.error);

  const mode = resolveAiMode(getCookie(req, AI_MODE_COOKIE));
  const now = Date.now();
  const r = await compileContract(body.value.sentence, { ai: aiRuntime(mode), registry: loadRegistry(getDb()), now });
  if (!r.ok) return errorJson({ code: "AI_ERROR", message: r.error.message, detail: { reason: r.error.code } });
  return okJson(r.value);
}
