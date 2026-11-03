// pnpm keys — dev Ed25519 keypair for the school. Writes .data/keys/school.json (gitignored) and prints
// env lines for Render (SCHOOL_PRIVATE_KEY / SCHOOL_PUBLIC_KEY). Use --force to replace an existing pair.
import { existsSync, rmSync } from "node:fs";
import { join } from "node:path";
import { loadSchoolKeys } from "@/lib/crypto/ed25519";

const file = join(process.cwd(), ".data", "keys", "school.json");
if (process.argv.includes("--force") && existsSync(file)) rmSync(file);

const keys = loadSchoolKeys({}, file);
console.log(keys.source === "generated" ? `Generated ${file}` : `Using existing ${file} (pass --force to replace)`);
console.log("\n# Add to .env / Render secrets (then run pnpm db:reset so the registry picks up the public key):");
console.log(`SCHOOL_PRIVATE_KEY=${keys.privateKey}`);
console.log(`SCHOOL_PUBLIC_KEY=${keys.publicKey}`);
