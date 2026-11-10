import { z } from "zod";
import { AI_MODE_COOKIE } from "@/lib/ai/runtime";
import { liveAiAvailable } from "@/lib/ai/provider";
import { errorJson, okJson, parseBody } from "@/lib/http/respond";

const Body = z.object({ mode: z.enum(["fixture", "live"]) });

/** Header toggle: per-browser AI mode override. Live is refused when no API key is configured. */
export async function POST(req: Request) {
  const body = await parseBody(req, Body);
  if (!body.ok) return errorJson(body.error);
  if (body.value.mode === "live" && !liveAiAvailable()) {
    return errorJson({ code: "AI_ERROR", message: "Live AI is not configured on this server.", detail: { reason: "AI_NOT_CONFIGURED" } });
  }
  const res = okJson({ mode: body.value.mode });
  res.cookies.set(AI_MODE_COOKIE, body.value.mode, { httpOnly: true, sameSite: "lax", path: "/" });
  return res;
}
