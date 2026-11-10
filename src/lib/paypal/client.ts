import "server-only";
// The money-moving PayPal client. ESLint restricts importing this module to lib/orchestrator/**
// (plus lib/paypal, scripts, tests). See docs/01-ARCHITECTURE.md "Module dependency rules".

import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { earmarks } from "@/lib/db/schema";
import { env } from "@/lib/env";
import { createMockPayPal, type MockPayPal } from "./mock";
import { createSandboxPayPal } from "./sandbox";
import type { PayPalClient } from "./types";

/** The mock keeps state in memory, so it adopts holds the DB recorded (seeded data, or held before a restart). */
function knownHold(authId: string) {
  const row = getDb()
    .select({ capMinor: earmarks.capMinor, currency: earmarks.currency })
    .from(earmarks)
    .where(eq(earmarks.authorizationId, authId))
    .get();
  return row ? { amountMinor: row.capMinor, currency: row.currency } : null;
}

const globalForPayPal = globalThis as unknown as { __earmarkMockPayPal?: MockPayPal };

export const paypal: PayPalClient =
  env.PAYPAL_MODE === "sandbox"
    ? createSandboxPayPal({ clientId: env.PAYPAL_CLIENT_ID!, clientSecret: env.PAYPAL_CLIENT_SECRET! })
    : (globalForPayPal.__earmarkMockPayPal ??= createMockPayPal({ resolveAuthorization: knownHold }));

/** Read-only view of the mock's state, for the Guardian's stub toolkit tools. Null in sandbox mode. */
export function mockState(): ReturnType<MockPayPal["inspect"]> | null {
  return env.PAYPAL_MODE === "sandbox" ? null : (paypal as MockPayPal).inspect();
}

/** Judge-mode reset: the mock forgets every order, hold and payout. No-op in sandbox mode. */
export function resetMockPayPal(): void {
  if (env.PAYPAL_MODE !== "sandbox") (paypal as MockPayPal).reset();
}
