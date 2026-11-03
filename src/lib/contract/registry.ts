// Payee resolution against the institution registry (docs/04-AI-AGENTS.md §1 step 2).
// Case-insensitive EXACT match on name or alias, verified institutions only. No fuzzy matching:
// "Lakeview Secondary Schools Ltd" must never resolve to "Lakeview Secondary School".
// Isomorphic (no I/O): callers pass the registry rows in.

export interface RegistryEntry {
  id: string;
  name: string;
  aliases: string[];
  verified: boolean;
}

export type Resolution =
  | { status: "resolved"; institution: RegistryEntry }
  | { status: "unverified"; institution: RegistryEntry }
  | { status: "unknown" };

/** Lowercase, Unicode-normalize, collapse whitespace, drop a leading "the" and trailing punctuation. Nothing else. */
export function normalizeInstitutionName(name: string): string {
  return name
    .normalize("NFKC")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^the /, "")
    .replace(/[.,;:!]+$/, "");
}

export function resolveInstitution(name: string, registry: readonly RegistryEntry[]): Resolution {
  const wanted = normalizeInstitutionName(name);
  if (wanted === "") return { status: "unknown" };
  const match = registry.find((r) => [r.name, ...r.aliases].some((n) => normalizeInstitutionName(n) === wanted));
  if (!match) return { status: "unknown" };
  return match.verified ? { status: "resolved", institution: match } : { status: "unverified", institution: match };
}
