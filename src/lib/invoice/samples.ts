import "server-only";
// The 12 synthetic eval invoices (docs/09-ATTACK-LAB-AND-EVALS.md §1). Shared by the eval runner, the Attack Lab
// and the "use a sample" upload button, so all three feed the same bytes through the same pipeline.
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import { RULE_IDS } from "@/lib/policy/types";

export const SAMPLES_DIR = join(process.cwd(), "evals", "fixtures");

const LineItem = z.object({ label: z.string(), amount: z.string() });

export const InvoiceVars = z.object({
  institutionName: z.string(),
  payoutAccount: z.string(),
  invoiceNumber: z.string(),
  studentName: z.string(),
  description: z.string(),
  lineItems: z.array(LineItem),
  total: z.string(),
  currency: z.string(),
  issueDate: z.string(),
  dueDate: z.string(),
  hiddenText: z.string().optional(),
});
export type InvoiceVars = z.infer<typeof InvoiceVars>;

const RuleId = z.enum(RULE_IDS);

export const EvalCase = z.object({
  id: z.string(),
  file: z.string(),
  kind: z.enum(["clean", "hostile"]),
  photo: z.boolean().optional(),
  copyOf: z.string().optional(),
  vars: InvoiceVars.partial().optional(),
  extraction: z.object({ confidence: z.number().optional(), containsInstructions: z.boolean().optional() }).optional(),
  earmarkOverrides: z.object({ expiresInDays: z.number() }).optional(),
  expected: z.object({
    verdict: z.enum(["ALLOW", "BLOCK", "REQUIRE_APPROVAL"]),
    rules: z.array(RuleId),
    alsoWarn: z.array(RuleId).optional(),
  }),
});
export type EvalCase = z.infer<typeof EvalCase>;

const CasesFile = z.object({ base: InvoiceVars.omit({ invoiceNumber: true }), cases: z.array(EvalCase) });

/** Written by `pnpm fixtures`: which payout email is printed on the clean invoices, and each file's hash. */
export const Manifest = z.object({ schoolEmail: z.string(), generatedAt: z.string(), files: z.record(z.string(), z.string()) });
export type Manifest = z.infer<typeof Manifest>;

export function loadCases(dir = SAMPLES_DIR): z.infer<typeof CasesFile> {
  return CasesFile.parse(JSON.parse(readFileSync(join(dir, "cases.json"), "utf8")));
}

export function loadManifest(dir = SAMPLES_DIR): Manifest | null {
  const path = join(dir, "manifest.json");
  return existsSync(path) ? Manifest.parse(JSON.parse(readFileSync(path, "utf8"))) : null;
}

/** The printed values of a case, with `{{schoolEmail}}` filled in. Follows `copyOf`. */
export function caseVars(c: EvalCase, all: z.infer<typeof CasesFile>, schoolEmail: string): InvoiceVars {
  const source = c.copyOf ? all.cases.find((x) => x.id === c.copyOf) : c;
  if (!source) throw new Error(`case ${c.id}: copyOf ${c.copyOf} not found`);
  const vars = InvoiceVars.parse({ ...all.base, ...source.vars });
  return { ...vars, payoutAccount: vars.payoutAccount.replace("{{schoolEmail}}", schoolEmail) };
}

export interface SampleFile {
  id: string;
  file: string;
  bytes: Uint8Array;
  mime: string;
}

export function mimeFor(file: string): string {
  if (file.endsWith(".pdf")) return "application/pdf";
  if (file.endsWith(".png")) return "image/png";
  return "image/jpeg";
}

/** Sample by case id ("05") or file stem ("05-swapped-account"). */
export function loadSample(idOrStem: string, dir = SAMPLES_DIR): SampleFile | null {
  const c = loadCases(dir).cases.find((x) => x.id === idOrStem || x.file.replace(/\.[a-z]+$/, "") === idOrStem);
  if (!c) return null;
  const path = join(dir, c.file);
  if (!existsSync(path)) return null;
  return { id: c.id, file: c.file, bytes: new Uint8Array(readFileSync(path)), mime: mimeFor(c.file) };
}
