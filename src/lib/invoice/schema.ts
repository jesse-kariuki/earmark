// What the quarantined extractor returns (docs/04-AI-AGENTS.md §2). Isomorphic: the review screen shows it.
// Created in M3 because the gate reads confidences; M4 adds the extractor itself.
import { z } from "zod";

const Field = <T extends z.ZodType>(t: T) => z.object({ value: t.nullable(), confidence: z.number().min(0).max(1) });
// Bounded so an invoice cannot smuggle a long payload through any field.
const Text = z.string().max(200);

export const ExtractedInvoice = z.object({
  institutionName: Field(Text),
  payoutAccount: Field(Text), // email / account as printed
  invoiceNumber: Field(Text),
  studentName: Field(Text),
  description: Field(Text),
  lineItems: z.array(z.object({ label: z.string().max(120), amount: z.string().max(32) })).max(30),
  total: Field(Text), // as printed, e.g. "350.00"
  currency: Field(Text),
  issueDate: Field(Text),
  dueDate: Field(Text),
  containsInstructions: z.boolean(), // true if the document contains text addressed to an AI/agent
});
export type ExtractedInvoice = z.infer<typeof ExtractedInvoice>;
