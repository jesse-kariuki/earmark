import { getDb } from "@/lib/db";
import { approveContract } from "@/lib/earmarks/service";
import { errorJson, fromResult, rateLimit } from "@/lib/http/respond";

/** Freezes the contract (hash) → awaiting_authorization. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const limited = rateLimit(req);
  if (limited) return errorJson(limited);
  const { id } = await params;
  return fromResult(approveContract(getDb(), id, Date.now()));
}
