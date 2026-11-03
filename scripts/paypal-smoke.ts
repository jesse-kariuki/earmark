// Manual Day-0 sandbox smoke test (docs/03-PAYPAL-INTEGRATION.md §0, §5).
// order $2.00 → approve in browser → authorize → capture $1.00 final → payout $1.00 → void a second auth.
// Prints every ID + status; paste the findings into PROGRESS.md → "Day-0 findings".
//
//   pnpm paypal:smoke              # full run (needs a browser approval, twice)
//   pnpm paypal:smoke --checks     # OAuth + webhook event names only, no money moves

import "dotenv/config";
import { createInterface } from "node:readline/promises";
import { parseEnv } from "@/lib/env";
import { createSandboxPayPal } from "@/lib/paypal/sandbox";
import { PayPalError, requestIdFor, type PayPalTraceEntry } from "@/lib/paypal/types";

const WANTED_WEBHOOK_EVENTS = [
  "PAYMENT.AUTHORIZATION.CREATED",
  "PAYMENT.AUTHORIZATION.VOIDED",
  "PAYMENT.CAPTURE.COMPLETED",
  "PAYMENT.CAPTURE.DENIED",
  "PAYMENT.CAPTURE.PENDING",
  "PAYMENT.PAYOUTSBATCH.SUCCESS",
  "PAYMENT.PAYOUTSBATCH.DENIED",
  "PAYMENT.PAYOUTSBATCH.PROCESSING",
  "PAYMENT.PAYOUTS-ITEM.SUCCEEDED",
  "PAYMENT.PAYOUTS-ITEM.FAILED",
  "PAYMENT.PAYOUTS-ITEM.BLOCKED",
  "PAYMENT.PAYOUTS-ITEM.UNCLAIMED",
  "PAYMENT.PAYOUTS-ITEM.RETURNED",
];

const env = parseEnv({ ...process.env, PAYPAL_MODE: "sandbox" });
const checksOnly = process.argv.includes("--checks");
const runId = `smoke_${Date.now()}`;
const findings: Record<string, string> = {};

const traceLog = (t: PayPalTraceEntry) =>
  console.log(`  ↳ ${t.method} ${t.path} → ${t.status}${t.requestId ? ` [${t.requestId}]` : ""}${t.debugId ? ` debug_id=${t.debugId}` : ""}`);

const pp = createSandboxPayPal({
  clientId: env.PAYPAL_CLIENT_ID!,
  clientSecret: env.PAYPAL_CLIENT_SECRET!,
  trace: traceLog,
});

const rl = createInterface({ input: process.stdin, output: process.stdout });

async function step<T>(label: string, fn: () => Promise<T>): Promise<T | undefined> {
  console.log(`\n▶ ${label}`);
  try {
    const r = await fn();
    console.log("  ✓", JSON.stringify(r));
    return r;
  } catch (e) {
    if (e instanceof PayPalError) {
      console.log(`  ✗ ${e.status} ${e.name}: ${e.message} (debug_id=${e.debugId ?? "-"})`);
      if (e.details.length) console.log("    details:", JSON.stringify(e.details));
    } else {
      console.log("  ✗", e);
    }
    return undefined;
  }
}

async function approveAndAuthorize(id: string, amountMinor: number) {
  const order = await step(`create AUTHORIZE order ${id} (${amountMinor / 100} USD)`, () =>
    pp.createAuthorizeOrder(
      { earmarkId: id, amountMinor, currency: "USD", description: "Earmark smoke test (sandbox)" },
      requestIdFor(id, "order"),
    ),
  );
  if (!order) return undefined;
  console.log(`\n  Open this URL, log in as the SENDER sandbox (personal) account and approve:\n  ${order.approveUrl}\n`);
  await rl.question("  Press Enter after approving… ");
  return step(`authorize order ${order.orderId}`, () => pp.authorizeOrder(order.orderId, requestIdFor(id, "authorize")));
}

async function main() {
  console.log(`Earmark PayPal sandbox smoke · run ${runId}`);

  const auth = await step("OAuth token (platform app)", () => pp.checkAuth());
  findings["OAuth token"] = auth ? "OK" : "FAILED";
  if (!auth) return;

  const types = await step("list webhook event types", async () => {
    const names = await pp.listWebhookEventTypes();
    const missing = WANTED_WEBHOOK_EVENTS.filter((n) => !names.includes(n));
    return { total: names.length, missing };
  });
  findings["Webhook event names"] = types ? (types.missing.length ? `missing: ${types.missing.join(", ")}` : "all present") : "FAILED";

  if (checksOnly) return;

  // 1. Hold $2.00, capture $1.00 with final_capture → remainder released.
  const a = await approveAndAuthorize(`${runId}_a`, 200);
  if (a) {
    findings["Authorization status after authorize"] = a.status;
    const cap = await step("capture $1.00 of $2.00 (final_capture: true)", () =>
      pp.captureAuthorization(
        { authorizationId: a.authorizationId, amountMinor: 100, currency: "USD", invoiceId: `${runId}_inv`, finalCapture: true },
        requestIdFor(`${runId}_pay`, "capture"),
      ),
    );
    const replay = await step("replay capture with the same PayPal-Request-Id (expect same capture id)", () =>
      pp.captureAuthorization(
        { authorizationId: a.authorizationId, amountMinor: 100, currency: "USD", invoiceId: `${runId}_inv`, finalCapture: true },
        requestIdFor(`${runId}_pay`, "capture"),
      ),
    );
    const after = await step("get authorization after partial final capture", () => pp.getAuthorization(a.authorizationId));
    findings["Partial capture + final_capture"] = cap
      ? `capture ${cap.status}; auth after: ${after?.status ?? "?"}; replay same id: ${replay?.captureId === cap.captureId}`
      : "FAILED";

    // 2. Payout $1.00 to the school.
    const payout = await step(`payout $1.00 → ${env.SCHOOL_PAYPAL_EMAIL}`, () =>
      pp.createPayout(
        {
          senderBatchId: `${runId}_pay`,
          senderItemId: `${runId}_pay`,
          receiverEmail: env.SCHOOL_PAYPAL_EMAIL,
          amountMinor: 100,
          currency: "USD",
          note: "Earmark smoke test",
        },
        requestIdFor(`${runId}_pay`, "payout"),
      ),
    );
    findings["Payouts enabled"] = payout ? `yes (batch ${payout.batchStatus})` : "NO — see Fallback A";
    if (payout) {
      let batch;
      for (let i = 0; i < 6; i++) {
        batch = await step(`poll payout batch ${payout.batchId} (#${i + 1})`, () => pp.getPayoutBatch(payout.batchId));
        if (batch && !["PENDING", "PROCESSING"].includes(batch.batchStatus)) break;
        await new Promise((r) => setTimeout(r, 5000));
      }
      findings["Payout final batch status"] = batch?.batchStatus ?? "unknown";
    }
  }

  // 3. Second hold, then void it.
  const b = await approveAndAuthorize(`${runId}_b`, 100);
  if (b) {
    const v = await step("void second authorization", () => pp.voidAuthorization(b.authorizationId, requestIdFor(`${runId}_b`, "void")));
    const after = await step("get authorization after void", () => pp.getAuthorization(b.authorizationId));
    findings["Void"] = v ? `OK; auth after: ${after?.status ?? "?"}` : "FAILED";
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => {
    rl.close();
    console.log("\n=== Day-0 findings (copy into PROGRESS.md) ===");
    for (const [k, v] of Object.entries(findings)) console.log(`- ${k}: ${v}`);
  });
