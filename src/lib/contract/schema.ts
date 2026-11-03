// Intent Contract (docs/04-AI-AGENTS.md §1). Isomorphic: shown to the sender in the browser.
// Added in M1 so the DB column is typed; M2 adds the draft schema and compile flow.
import { z } from "zod";

export const IntentContract = z.object({
  version: z.literal(1),
  purpose: z.object({
    category: z.enum(["school_fees", "medical", "rent", "utilities", "other"]),
    description: z.string().max(200),
    beneficiary: z.string(),
    period: z.string().optional(),
  }),
  payee: z.object({
    institutionName: z.string(), // as the sender wrote it
    institutionId: z.string().nullable(), // resolved by CODE from the registry, never by the model
  }),
  capMinor: z.number().int().positive(),
  currency: z.enum(["USD"]),
  expiresAt: z.string().datetime(),
  evidence: z.object({
    required: z.enum(["signed_invoice", "invoice_any", "invoice_and_approval"]),
  }),
  approvalThresholdMinor: z.number().int().nonnegative(), // payments ≥ this need sender approval
  confidenceFloor: z.number().min(0).max(1).default(0.85),
  allowPartial: z.boolean().default(true),
  payInstitutionOnly: z.literal(true),
  notes: z.array(z.string()).default([]),
});
export type IntentContract = z.infer<typeof IntentContract>;
