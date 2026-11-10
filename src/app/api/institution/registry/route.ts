import { getDb } from "@/lib/db";
import { institutions } from "@/lib/db/schema";
import { okJson } from "@/lib/http/respond";

export const dynamic = "force-dynamic";

/** Public registry: who is verified and which key signs their invoices. Payout emails are not published. */
export async function GET() {
  const rows = getDb()
    .select({ id: institutions.id, name: institutions.name, verified: institutions.verified, publicKey: institutions.publicKey })
    .from(institutions)
    .all();
  return okJson(rows);
}
