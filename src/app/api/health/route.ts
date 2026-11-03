import { NextResponse } from "next/server";
import { env } from "@/lib/env";

export const dynamic = "force-dynamic";

export function GET() {
  return NextResponse.json({
    ok: true,
    service: "earmark",
    paypalMode: env.PAYPAL_MODE,
    aiMode: env.AI_MODE,
    payoutMode: env.PAYOUT_MODE,
    time: new Date().toISOString(),
  });
}
