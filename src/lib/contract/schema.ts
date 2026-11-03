// Intent Contract (docs/04-AI-AGENTS.md §1). Isomorphic: shown to the sender in the browser.
import { z } from "zod";

const Purpose = z.object({
  category: z.enum(["school_fees", "medical", "rent", "utilities", "other"]),
  description: z.string().max(200),
  beneficiary: z.string(),
  period: z.string().optional(),
});

const EvidenceRequired = z.enum(["signed_invoice", "invoice_any", "invoice_and_approval"]);

export const IntentContract = z.object({
  version: z.literal(1),
  purpose: Purpose,
  payee: z.object({
    institutionName: z.string(), // as the sender wrote it
    institutionId: z.string().nullable(), // resolved by CODE from the registry, never by the model
  }),
  capMinor: z.number().int().positive(),
  currency: z.enum(["USD"]),
  expiresAt: z.string().datetime(),
  evidence: z.object({ required: EvidenceRequired }),
  approvalThresholdMinor: z.number().int().nonnegative(), // payments ≥ this need sender approval
  confidenceFloor: z.number().min(0).max(1).default(0.85),
  allowPartial: z.boolean().default(true),
  payInstitutionOnly: z.literal(true),
  notes: z.array(z.string()).default([]),
});
export type IntentContract = z.infer<typeof IntentContract>;

/**
 * What the model returns. No institutionId (code resolves it), no fixed fields (code sets them).
 * Fields the sender did not state are null, and code applies the defaults (compile.ts).
 */
export const IntentContractDraft = z.object({
  purpose: z.object({
    category: Purpose.shape.category,
    description: z.string().max(200),
    beneficiary: z.string(),
    period: z.string().nullable(),
  }),
  payee: z.object({ institutionName: z.string() }),
  capMinor: z.number().int().positive(),
  currency: z.enum(["USD"]),
  expiresAt: z.string().datetime().nullable(),
  evidence: z.object({ required: EvidenceRequired }),
  approvalThresholdMinor: z.number().int().nonnegative().nullable(),
  notes: z.array(z.string()),
});
export type IntentContractDraft = z.infer<typeof IntentContractDraft>;
