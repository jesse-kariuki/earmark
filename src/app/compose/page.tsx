import { env } from "@/lib/env";
import { ComposeClient } from "./ComposeClient";

export const metadata = { title: "Earmark money · Earmark" };

export default function ComposePage() {
  return (
    <ComposeClient
      paypalMode={env.PAYPAL_MODE}
      paypalClientId={env.NEXT_PUBLIC_PAYPAL_CLIENT_ID ?? null}
      kesRate={env.KES_DISPLAY_RATE}
    />
  );
}
