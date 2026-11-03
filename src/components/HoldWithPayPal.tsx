"use client";
import { PayPalButtons, PayPalScriptProvider } from "@paypal/react-paypal-js";
import { Loader2, Lock } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/http/client";

// Step 2 of compose: hold the money. Sandbox → real PayPal Buttons (intent=authorize; our server creates and
// authorizes the order). Mock → one button that runs the same two server calls against the in-memory PayPal.

export function HoldWithPayPal({
  earmarkId,
  paypalMode,
  clientId,
  onHeld,
}: {
  earmarkId: string;
  paypalMode: "mock" | "sandbox";
  clientId: string | null;
  onHeld: () => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function createOrder(): Promise<string> {
    const r = await api<{ orderId: string }>(`/api/earmarks/${earmarkId}/paypal/order`);
    if (!r.ok) {
      setError(withDebugId(r.error));
      throw new Error(r.error.message);
    }
    return r.data.orderId;
  }

  async function authorize(orderId: string): Promise<void> {
    const r = await api(`/api/earmarks/${earmarkId}/paypal/authorize`, { orderId });
    if (!r.ok) {
      setError(withDebugId(r.error));
      return;
    }
    onHeld();
  }

  return (
    <div className="space-y-3 rounded-xl border p-4">
      <p className="flex items-center gap-2 text-sm font-medium">
        <Lock aria-hidden className="size-4 text-teal-700" /> Contract approved. Now hold the money in PayPal.
      </p>
      <p className="text-xs text-muted-foreground">PayPal holds the full amount. Only the verified invoice amount is ever taken.</p>

      {paypalMode === "sandbox" && clientId ? (
        <PayPalScriptProvider options={{ clientId, intent: "authorize", currency: "USD" }}>
          <PayPalButtons
            style={{ layout: "vertical", label: "pay" }}
            createOrder={createOrder}
            onApprove={(data) => authorize(data.orderID)}
            onError={() => setError("PayPal could not complete the approval. Try again.")}
          />
        </PayPalScriptProvider>
      ) : (
        <Button
          size="lg"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            setError(null);
            try {
              await authorize(await createOrder());
            } catch {
              // error already shown
            } finally {
              setBusy(false);
            }
          }}
        >
          {busy && <Loader2 className="animate-spin" aria-hidden />}
          {paypalMode === "sandbox" ? "Hold with PayPal (client id missing)" : "Hold with PayPal (mock)"}
        </Button>
      )}

      {error && (
        <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-900">
          {error}
        </p>
      )}
    </div>
  );
}

function withDebugId(e: { message: string; detail?: Record<string, string | string[]> }): string {
  const debugId = e.detail?.debugId;
  return debugId ? `${e.message} (PayPal debug id ${String(debugId)})` : e.message;
}
