import "server-only";
// The money-moving PayPal client. ESLint restricts importing this module to lib/orchestrator/**
// (plus lib/paypal, scripts, tests). See docs/01-ARCHITECTURE.md "Module dependency rules".

import { env } from "@/lib/env";
import { createMockPayPal } from "./mock";
import { createSandboxPayPal } from "./sandbox";
import type { PayPalClient } from "./types";

export const paypal: PayPalClient =
  env.PAYPAL_MODE === "sandbox"
    ? createSandboxPayPal({ clientId: env.PAYPAL_CLIENT_ID!, clientSecret: env.PAYPAL_CLIENT_SECRET! })
    : createMockPayPal();
