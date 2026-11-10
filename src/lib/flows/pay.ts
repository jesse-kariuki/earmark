import "server-only";
// Guardian → ticket → orchestrator. The model only ever gets a ticket from the gate; this code, not the model,
// hands it to the orchestrator (docs/04-AI-AGENTS.md §3).
import { type GuardianResult, runGuardian } from "@/lib/agents/guardian";
import type { AiMode } from "@/lib/ai/call";
import { getDb } from "@/lib/db";
import { env } from "@/lib/env";
import type { AppError } from "@/lib/errors";
import { orchestrator } from "@/lib/orchestrator";
import type { PaymentOutcome } from "@/lib/orchestrator/execute";
import { paypalReadTools } from "@/lib/paypal/toolkit";
import type { Result } from "@/lib/result";

export interface GuardAndPayResult {
  guardian: GuardianResult;
  payment: Result<PaymentOutcome, AppError> | null;
}

export async function guardAndPay(invoiceId: string, mode: AiMode): Promise<GuardAndPayResult> {
  const guardian = await runGuardian(
    { db: getDb(), now: Date.now, readTools: paypalReadTools(), mode, model: env.ANTHROPIC_MODEL, apiKeyPresent: Boolean(env.ANTHROPIC_API_KEY) },
    invoiceId,
  );
  const payment = guardian.ticketId ? await orchestrator.execute(guardian.ticketId) : null;
  return { guardian, payment };
}
