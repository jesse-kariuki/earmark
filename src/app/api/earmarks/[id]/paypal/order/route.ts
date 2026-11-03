import { errorJson, fromResult, rateLimit } from "@/lib/http/respond";
import { orchestrator } from "@/lib/orchestrator";

/** Orders v2 create (intent AUTHORIZE) for the Earmark cap → { orderId }. Called by the PayPal Buttons' createOrder. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const limited = rateLimit(req);
  if (limited) return errorJson(limited);
  const { id } = await params;
  return fromResult(await orchestrator.createAuthorizeOrder(id));
}
