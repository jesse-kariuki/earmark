import "server-only";
// Route-facing orchestrator entry points, bound to the app DB and the configured PayPal client.
// Route handlers import from here; they can never import the PayPal client directly (ESLint money rule).
import { getDb } from "@/lib/db";
import { paypal } from "@/lib/paypal/client";
import { authorizeEarmark, createAuthorizeOrder } from "./authorize";

export const orchestrator = {
  createAuthorizeOrder: (earmarkId: string) => createAuthorizeOrder(getDb(), paypal, earmarkId, Date.now()),
  authorize: (earmarkId: string, orderId: string) => authorizeEarmark(getDb(), paypal, earmarkId, orderId, Date.now()),
};
