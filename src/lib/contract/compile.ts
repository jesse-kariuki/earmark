import "server-only";
// Sentence → IntentContract (docs/04-AI-AGENTS.md §1). The model drafts; code resolves the payee and applies defaults.
import { type AiCallMeta, type AiRuntime, callAi } from "@/lib/ai/call";
import { sha256HexSync } from "@/lib/crypto/sha256";
import { err, ok, type Result } from "@/lib/result";
import { compileInstructions } from "./prompt";
import { type RegistryEntry, resolveInstitution } from "./registry";
import { IntentContract, IntentContractDraft } from "./schema";

export const DEFAULT_EXPIRY_MS = 3 * 24 * 60 * 60 * 1000; // PayPal honor period
export const DEFAULT_CONFIDENCE_FLOOR = 0.85;

export type CompileWarningCode = "PAYEE_UNKNOWN" | "PAYEE_UNVERIFIED" | "EXPIRY_IN_PAST";

export interface CompileWarning {
  code: CompileWarningCode;
  message: string;
}

export interface CompiledContract {
  contract: IntentContract;
  warnings: CompileWarning[];
  /** Verified institutions the sender can pick from when the payee did not resolve. */
  candidates: { id: string; name: string }[];
}

/** Whitespace-normalized sentence hash: the fixture key for contract.compile. */
export function sentenceHash(sentence: string): string {
  return sha256HexSync(sentence.trim().replace(/\s+/g, " "));
}

/** Pure: draft + registry + clock → contract and warnings. */
export function buildContract(draft: IntentContractDraft, registry: readonly RegistryEntry[], now: number): CompiledContract {
  const warnings: CompileWarning[] = [];
  const resolution = resolveInstitution(draft.payee.institutionName, registry);
  let institutionId: string | null = null;

  if (resolution.status === "resolved") {
    institutionId = resolution.institution.id;
  } else if (resolution.status === "unverified") {
    warnings.push({
      code: "PAYEE_UNVERIFIED",
      message: `"${draft.payee.institutionName}" is in the registry but not verified. Pick a verified institution.`,
    });
  } else {
    warnings.push({
      code: "PAYEE_UNKNOWN",
      message: `"${draft.payee.institutionName}" is not a registered institution. Pick a verified institution.`,
    });
  }

  let expiresAt = now + DEFAULT_EXPIRY_MS;
  if (draft.expiresAt !== null) {
    const stated = Date.parse(draft.expiresAt);
    if (stated > now) {
      expiresAt = stated;
    } else {
      warnings.push({ code: "EXPIRY_IN_PAST", message: "The end date is in the past, so the default of 3 days is used." });
    }
  }

  const contract = IntentContract.parse({
    version: 1,
    purpose: {
      category: draft.purpose.category,
      description: draft.purpose.description,
      beneficiary: draft.purpose.beneficiary,
      ...(draft.purpose.period ? { period: draft.purpose.period } : {}),
    },
    payee: { institutionName: draft.payee.institutionName, institutionId },
    capMinor: draft.capMinor,
    currency: draft.currency,
    expiresAt: new Date(expiresAt).toISOString(),
    evidence: draft.evidence,
    approvalThresholdMinor: draft.approvalThresholdMinor ?? draft.capMinor,
    confidenceFloor: DEFAULT_CONFIDENCE_FLOOR,
    allowPartial: true,
    payInstitutionOnly: true,
    notes: draft.notes,
  });

  const candidates = institutionId ? [] : registry.filter((r) => r.verified).map((r) => ({ id: r.id, name: r.name }));
  return { contract, warnings, candidates };
}

export async function compileContract(
  sentence: string,
  deps: { ai: AiRuntime; registry: readonly RegistryEntry[]; now: number },
): Promise<Result<CompiledContract & { meta: AiCallMeta }, { code: string; message: string }>> {
  const result = await callAi(
    {
      stage: "contract.compile",
      schema: IntentContractDraft,
      instructions: compileInstructions(new Date(deps.now).toISOString().slice(0, 10)),
      prompt: sentence.trim(),
      fixtureKey: sentenceHash(sentence),
      summarize: (d) => `cap ${d.capMinor} ${d.currency} · ${d.purpose.category} · ${d.evidence.required}`,
    },
    deps.ai,
  );
  if (!result.ok) return err(result.error);
  return ok({ ...buildContract(result.value.output, deps.registry, deps.now), meta: result.value.meta });
}
