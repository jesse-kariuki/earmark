// Next.js boot hook: migrate + seed the SQLite DB before the first request (docs/02-DATA-MODEL.md "Seed").
// The import must sit inside this exact `if`: Next replaces NEXT_RUNTIME at compile time and drops the block from the
// edge bundle. An early `return` is not stripped, and the edge build then tries to bundle better-sqlite3 (needs `fs`).
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("./instrumentation-node");
  }
}
