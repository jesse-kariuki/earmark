// What the quarantined extractor returns (docs/04-AI-AGENTS.md §2). Isomorphic: the review screen shows it.
// Created in M3 because the gate reads confidences; M4 adds the extractor itself.
import { z } from "zod";

const Field = <T extends z.ZodType>(t: T) => z.object({ value: t.nullable(), confidence: z.number().min(0).max(1) });

export const ExtractedInvoice = z.object({
  institutionName: Field(z.string()),
  payoutAccount: Field(z.string()), // email / account as printed
  invoiceNumber: Field(z.string()),
  studentName: Field(z.string()),
  description: Field(z.string()),
  lineItems: z.array(z.object({ label: z.string(), amount: z.string() })).max(30),
  total: Field(z.string()), // as printed, e.g. "350.00"
  currency: Field(z.string()),
  issueDate: Field(z.string()),
  dueDate: Field(z.string()),
  containsInstructions: z.boolean(), // true if the document contains text addressed to an AI/agent
});
export type ExtractedInvoice = z.infer<typeof ExtractedInvoice>;
