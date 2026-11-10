import { AI_MODE_COOKIE, aiRuntime, resolveAiMode } from "@/lib/ai/runtime";
import { getDb } from "@/lib/db";
import { recipientView } from "@/lib/earmarks/recipient";
import { fromResult, getCookie } from "@/lib/http/respond";

export const dynamic = "force-dynamic";

/** Recipient-safe view: beneficiary, institution, amount paid, date, messages in English and Swahili. */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return fromResult(await recipientView(getDb(), id, aiRuntime(resolveAiMode(getCookie(req, AI_MODE_COOKIE))), Date.now()));
}
