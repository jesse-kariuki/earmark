import "server-only";
// The Guardian's PayPal READ tools (docs/03 §3.6). Sandbox: the official PayPal Agent Toolkit with only
// `orders.get` and `transactions.list` enabled, never anything that moves money. Mock: stubs of the same names
// that read the mock's state and our DB. The toolkit targets AI SDK v4, so the Guardian wraps these functions in
// its own v7 tools rather than passing the toolkit's tool objects through.
import { PayPalAgentToolkit } from "@paypal/agent-toolkit/ai-sdk";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { earmarks } from "@/lib/db/schema";
import { env } from "@/lib/env";
import { minorToDecimalString } from "@/lib/money";
import { mockState } from "./client";

export interface PayPalReadTools {
  source: "paypal-agent-toolkit" | "mock-stub";
  get_order(args: { id: string }): Promise<unknown>;
  list_transactions(args: { start_date: string; end_date: string }): Promise<unknown>;
}

/** Only read actions. The guardrail test asserts no create/capture/void/payout action is ever enabled. */
export const TOOLKIT_ACTIONS = { orders: { get: true }, transactions: { list: true } } as const;

type Executable = { execute?: (args: unknown, options: unknown) => Promise<unknown> };

function toolkitReadTools(): PayPalReadTools {
  const toolkit = new PayPalAgentToolkit({
    clientId: env.PAYPAL_CLIENT_ID!,
    clientSecret: env.PAYPAL_CLIENT_SECRET!,
    configuration: { actions: { orders: { ...TOOLKIT_ACTIONS.orders }, transactions: { ...TOOLKIT_ACTIONS.transactions } }, context: { sandbox: true } },
  });
  const tools = toolkit.getTools() as Record<string, Executable>;
  const run = async (name: string, args: unknown) => {
    const t = tools[name];
    if (!t?.execute) throw new Error(`PayPal Agent Toolkit has no ${name} tool`);
    return t.execute(args, { toolCallId: `guardian-${name}`, messages: [] });
  };
  return {
    source: "paypal-agent-toolkit",
    get_order: (args) => run("get_order", args),
    list_transactions: (args) => run("list_transactions", args),
  };
}

function mockReadTools(): PayPalReadTools {
  return {
    source: "mock-stub",
    async get_order({ id }) {
      // Shaped like the Orders v2 GET response, from the mock's memory, falling back to what our DB recorded.
      const e = getDb().select().from(earmarks).where(eq(earmarks.paypalOrderId, id)).get();
      if (!e) return { name: "RESOURCE_NOT_FOUND", message: `Order ${id} not found` };
      const auth = mockState()?.authorizations.find((a) => a.id === e.authorizationId);
      const value = minorToDecimalString(e.capMinor);
      return {
        id,
        intent: "AUTHORIZE",
        status: e.authorizationId ? "COMPLETED" : "CREATED",
        purchase_units: [
          {
            reference_id: e.id,
            amount: { currency_code: e.currency, value },
            payments: e.authorizationId ? { authorizations: [{ id: e.authorizationId, status: auth?.status ?? "CREATED", amount: { currency_code: e.currency, value } }] } : {},
          },
        ],
      };
    },
    async list_transactions() {
      return { transaction_details: [], note: "mock mode: no PayPal transaction history" };
    },
  };
}

export function paypalReadTools(): PayPalReadTools {
  return env.PAYPAL_MODE === "sandbox" ? toolkitReadTools() : mockReadTools();
}
