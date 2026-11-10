import { AI_MODE_COOKIE, aiRuntime, resolveAiMode } from "@/lib/ai/runtime";
import { runScenario, SCENARIO_IDS, type ScenarioId } from "@/lib/attacks/scenarios";
import { errorJson, getCookie, okJson, rateLimit } from "@/lib/http/respond";

/** Runs one Attack Lab scenario end to end in a throwaway DB (docs/09 §2). */
export async function POST(req: Request, { params }: { params: Promise<{ scenario: string }> }) {
  const limited = rateLimit(req);
  if (limited) return errorJson(limited);
  const { scenario } = await params;
  if (!(SCENARIO_IDS as readonly string[]).includes(scenario)) return errorJson({ code: "NOT_FOUND", message: `No scenario "${scenario}".` });
  try {
    const r = await runScenario(scenario as ScenarioId, aiRuntime(resolveAiMode(getCookie(req, AI_MODE_COOKIE))));
    return okJson({ ...r, traceUrl: null });
  } catch (e) {
    return errorJson({ code: "AI_ERROR", message: e instanceof Error ? e.message : "The scenario failed to run." });
  }
}
