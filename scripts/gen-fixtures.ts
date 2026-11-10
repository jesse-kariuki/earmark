// pnpm fixtures — render the 12 eval invoices (docs/09-ATTACK-LAB-AND-EVALS.md §1) from
// evals/fixtures/templates/invoice.html + cases.json with headless Chromium, and write for each file a
// hand-authored "ideal extraction" fixture keyed by its sha256 (evals/fixtures/invoice.extract/<hash>.json).
// Chromium stamps a creation date into PDFs, so every run changes the hashes: live recordings under
// evals/fixtures/recorded/ go stale and must be re-recorded (pnpm eval:live with AI_RECORD=1).
import "dotenv/config";
import { copyFileSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { chromium } from "@playwright/test";
import type { FixtureFile } from "@/lib/ai/call";
import { sha256HexSync } from "@/lib/crypto/sha256";
import type { ExtractedInvoice } from "@/lib/invoice/schema";
import { caseVars, type EvalCase, type InvoiceVars, loadCases, type Manifest, SAMPLES_DIR } from "@/lib/invoice/samples";

const DIR = SAMPLES_DIR;
const EXTRACT_DIR = join(DIR, "invoice.extract");
const schoolEmail = process.env.SCHOOL_PAYPAL_EMAIL?.trim() || "sb-lakeview@business.example.com";

const escape = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

function render(template: string, v: InvoiceVars, photo: boolean): string {
  const rows = v.lineItems.map((li) => `<tr><td>${escape(li.label)}</td><td class="amount">${escape(li.amount)}</td></tr>`).join("\n");
  const fill: Record<string, string> = {
    institutionName: escape(v.institutionName),
    payoutAccount: escape(v.payoutAccount),
    invoiceNumber: escape(v.invoiceNumber),
    studentName: escape(v.studentName),
    description: escape(v.description),
    currency: escape(v.currency),
    total: escape(v.total),
    issueDate: escape(v.issueDate),
    dueDate: escape(v.dueDate),
    lineItemRows: rows,
    hiddenNote: v.hiddenText ? `<div class="hidden-note">${escape(v.hiddenText)}</div>` : "",
    // A "phone photo": slight rotation, a drop shadow on a desk-grey background and an uneven shadow across the page.
    pageBackground: photo ? "#7d828a" : "#ffffff",
    sheetTransform: photo ? "rotate(-1.6deg)" : "none",
    sheetShadow: photo ? "6px 10px 24px rgba(0,0,0,0.45)" : "none",
    sheetShade: photo ? "linear-gradient(115deg, rgba(0,0,0,0) 45%, rgba(0,0,0,0.13) 100%)" : "transparent",
  };
  return template.replace(/\{\{(\w+)\}\}/g, (_, key: string) => {
    if (!(key in fill)) throw new Error(`template variable {{${key}}} has no value`);
    return fill[key]!;
  });
}

/** What a perfect extractor would return for this case: the printed values, at the case's confidence. */
function idealExtraction(c: EvalCase, v: InvoiceVars): ExtractedInvoice {
  const confidence = c.extraction?.confidence ?? 0.98;
  const field = (value: string) => ({ value, confidence });
  return {
    institutionName: field(v.institutionName),
    payoutAccount: field(v.payoutAccount),
    invoiceNumber: field(v.invoiceNumber),
    studentName: field(v.studentName),
    description: field(v.description),
    lineItems: v.lineItems,
    total: field(v.total),
    currency: field(v.currency),
    issueDate: field(v.issueDate),
    dueDate: field(v.dueDate),
    containsInstructions: c.extraction?.containsInstructions ?? false,
  };
}

async function main() {
  const all = loadCases(DIR);
  const template = readFileSync(join(DIR, "templates", "invoice.html"), "utf8");
  rmSync(EXTRACT_DIR, { recursive: true, force: true });
  mkdirSync(EXTRACT_DIR, { recursive: true });
  for (const f of readdirSync(DIR)) if (/^\d\d-.*\.(pdf|png)$/.test(f)) rmSync(join(DIR, f));

  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 880, height: 1100 } });
  const files: Manifest["files"] = {};

  for (const c of all.cases) {
    const out = join(DIR, c.file);
    if (c.copyOf) {
      const source = all.cases.find((x) => x.id === c.copyOf)!;
      copyFileSync(join(DIR, source.file), out); // byte-identical, so the same hash and the same fixture
    } else {
      const vars = caseVars(c, all, schoolEmail);
      await page.setContent(render(template, vars, c.photo === true), { waitUntil: "load" });
      if (c.photo) await page.screenshot({ path: out, fullPage: true, type: "png" });
      else await page.pdf({ path: out, format: "A4", printBackground: true });
    }
    const hash = sha256HexSync(readFileSync(out));
    files[c.id] = hash;
    const fixture: FixtureFile = {
      stage: "invoice.extract",
      input: c.file,
      output: idealExtraction(c, caseVars(c, all, schoolEmail)),
      model: "hand-authored",
    };
    writeFileSync(join(EXTRACT_DIR, `${hash}.json`), `${JSON.stringify(fixture, null, 2)}\n`);
    console.log(`  ${c.file.padEnd(28)} ${hash.slice(0, 12)}…`);
  }
  await browser.close();

  const manifest: Manifest = { schoolEmail, generatedAt: new Date().toISOString(), files };
  writeFileSync(join(DIR, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(`fixtures: ${all.cases.length} invoices for ${schoolEmail}. Re-record live outputs if you use them (pnpm eval:live with AI_RECORD=1).`);
}

main().catch((e: unknown) => {
  console.error(e);
  process.exit(1);
});
