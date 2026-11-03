// System prompt for Intent Contract compilation (docs/04-AI-AGENTS.md §1).
export function compileInstructions(today: string): string {
  return `You convert a sponsor's instruction into a JSON payment contract. Output ONLY fields in the schema.
Rules: amounts in minor units (cents). If the sender gives a maximum ("up to $400"), that is capMinor.
If evidence is not mentioned, use "invoice_any". If an approval threshold is not mentioned, set
approvalThresholdMinor to null (code sets it equal to capMinor). If no end date is given, set expiresAt to null.
If no period is given, set purpose.period to null. Copy the institution name exactly as the sender wrote it.
Never invent an institution, amount or date; if something is ambiguous, keep the safest interpretation
and add a short note to \`notes\`. Today's date is ${today}.`;
}
