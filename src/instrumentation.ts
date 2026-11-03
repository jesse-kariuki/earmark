// Next.js boot hook: migrate + seed the SQLite DB before the first request (docs/02-DATA-MODEL.md "Seed").
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { getDb } = await import("@/lib/db");
  getDb();
}
