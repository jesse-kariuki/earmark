import { getDb } from "@/lib/db";
import { getEarmarkDetail } from "@/lib/earmarks/service";
import { fromResult } from "@/lib/http/respond";

export const dynamic = "force-dynamic";

/** Detail incl. money bar numbers. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return fromResult(getEarmarkDetail(getDb(), id));
}
