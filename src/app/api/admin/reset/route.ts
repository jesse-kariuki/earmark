import { adminAllowed, resetDemo } from "@/lib/admin/reset";
import { errorJson, okJson, rateLimit } from "@/lib/http/respond";

/** Drop, migrate and seed the demo DB (judge mode or x-reset-token). */
export async function POST(req: Request) {
  const limited = rateLimit(req);
  if (limited) return errorJson(limited);
  if (!adminAllowed(req)) return errorJson({ code: "INVALID_STATE", message: "Reset is only available in judge mode." });
  return okJson(resetDemo());
}
