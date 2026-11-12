import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The demo pipeline (demo/run.mjs) builds into its own folder so a running `next dev` cannot clobber it.
  ...(process.env.NEXT_DIST_DIR ? { distDir: process.env.NEXT_DIST_DIR } : {}),
  serverExternalPackages: ["better-sqlite3"],
};

export default nextConfig;
