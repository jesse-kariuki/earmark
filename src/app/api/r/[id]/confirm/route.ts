import { getDb } from "@/lib/db";
import { confirmRecipient } from "@/lib/earmarks/recipient";
import { errorJson, fromResult, rateLimit } from "@/lib/http/respond";

/** "Confirm I see this" → `recipient.confirmed`, once. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const limited = rateLimit(req);
  if (limited) return errorJson(limited);
  const { id } = await params;
  return fromResult(confirmRecipient(getDb(), id, Date.now()));
}
