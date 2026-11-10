import { env } from "@/lib/env";
import { errorJson, okJson } from "@/lib/http/respond";
import { orchestrator } from "@/lib/orchestrator";
import { WebhookBody } from "@/lib/orchestrator/webhooks";

/** PayPal webhook receiver: verified with PayPal, deduped on event id, and only ever confirms what we already did. */
export async function POST(req: Request) {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return errorJson({ code: "VALIDATION", message: "Body must be JSON." });
  }
  const body = WebhookBody.safeParse(raw);
  if (!body.success) return errorJson({ code: "VALIDATION", message: "Not a PayPal webhook event." });
  const h = (name: string) => req.headers.get(name) ?? "";
  const outcome = await orchestrator.webhook({
    webhookId: env.PAYPAL_WEBHOOK_ID,
    headers: {
      authAlgo: h("paypal-auth-algo"),
      certUrl: h("paypal-cert-url"),
      transmissionId: h("paypal-transmission-id"),
      transmissionSig: h("paypal-transmission-sig"),
      transmissionTime: h("paypal-transmission-time"),
    },
    body: body.data,
  });
  // 200 for every handled case, so PayPal does not retry an event we chose to ignore.
  return okJson({ outcome });
}
