import { existsSync, readFileSync } from "node:fs";
import { getDb } from "@/lib/db";
import { errorJson } from "@/lib/http/respond";
import { findInvoice } from "@/lib/invoice/intake";

export const dynamic = "force-dynamic";

const MIME: Record<string, string> = { pdf: "application/pdf", png: "image/png", jpg: "image/jpeg" };

/** The original uploaded file, for the review screen preview. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const found = findInvoice(getDb(), id);
  if (!found.ok) return errorJson(found.error);
  const path = found.value.storagePath;
  if (!path || !existsSync(path)) return errorJson({ code: "NOT_FOUND", message: "The original file is not stored (the demo DB resets on deploy)." });
  const ext = path.split(".").pop() ?? "";
  return new Response(readFileSync(path), {
    headers: { "content-type": MIME[ext] ?? "application/octet-stream", "content-disposition": "inline", "x-content-type-options": "nosniff" },
  });
}
