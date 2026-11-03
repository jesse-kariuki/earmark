"use client";
import { AlertTriangle, Info } from "lucide-react";
import type { IntentContract } from "@/lib/contract/schema";
import { formatMoney } from "@/lib/money";

// Renders an IntentContract as one readable sentence plus details (docs/07-UI-SCREENS.md).

export interface ContractWarning {
  code: string;
  message: string;
}

const EVIDENCE: Record<IntentContract["evidence"]["required"], string> = {
  signed_invoice: "a signed invoice from the school",
  invoice_any: "an invoice (signed or uploaded)",
  invoice_and_approval: "an invoice plus my approval",
};

const CATEGORY: Record<IntentContract["purpose"]["category"], string> = {
  school_fees: "School fees",
  medical: "Medical",
  rent: "Rent",
  utilities: "Utilities",
  other: "Other",
};

function shortDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

export function ContractPanel({
  contract,
  warnings = [],
  candidates = [],
  onPickInstitution,
  institutionName,
}: {
  contract: IntentContract;
  warnings?: ContractWarning[];
  candidates?: { id: string; name: string }[];
  onPickInstitution?: (c: { id: string; name: string }) => void;
  /** Registry name of the resolved institution, when it differs from what the sender wrote. */
  institutionName?: string;
}) {
  const payee = institutionName ?? contract.payee.institutionName;
  const unresolved = contract.payee.institutionId === null;
  const askAbove = contract.approvalThresholdMinor < contract.capMinor;

  return (
    <div className="rounded-xl border bg-card p-5 shadow-sm">
      <p className="text-base leading-relaxed">
        Pay <strong className={unresolved ? "text-red-700 line-through decoration-1" : ""}>{payee}</strong> · up to{" "}
        <strong className="tabular-nums">{formatMoney(contract.capMinor, contract.currency)}</strong> · for{" "}
        <strong>{contract.purpose.description}</strong> · until <strong>{shortDate(contract.expiresAt)}</strong> · needs{" "}
        <strong>{EVIDENCE[contract.evidence.required]}</strong>
        {askAbove && (
          <>
            {" "}
            · ask me from <strong className="tabular-nums">{formatMoney(contract.approvalThresholdMinor, contract.currency)}</strong>
          </>
        )}
      </p>

      <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
        <dt className="text-muted-foreground">Category</dt>
        <dd>{CATEGORY[contract.purpose.category]}</dd>
        <dt className="text-muted-foreground">Beneficiary</dt>
        <dd>{contract.purpose.beneficiary}</dd>
        {contract.purpose.period && (
          <>
            <dt className="text-muted-foreground">Period</dt>
            <dd>{contract.purpose.period}</dd>
          </>
        )}
        <dt className="text-muted-foreground">Payee in registry</dt>
        <dd className="font-mono text-xs leading-5">{contract.payee.institutionId ?? "not resolved"}</dd>
        <dt className="text-muted-foreground">Pays</dt>
        <dd>Institutions only, never a person</dd>
      </dl>

      {warnings.length > 0 && (
        <ul className="mt-4 space-y-2">
          {warnings.map((w) => (
            <li key={w.code} className="flex gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-900">
              <AlertTriangle aria-hidden className="mt-0.5 size-4 shrink-0" />
              <span>{w.message}</span>
            </li>
          ))}
        </ul>
      )}

      {unresolved && candidates.length > 0 && onPickInstitution && (
        <label className="mt-3 block text-sm">
          <span className="font-medium">Choose the verified institution</span>
          <select
            className="mt-1 block w-full rounded-lg border bg-background px-3 py-2"
            defaultValue=""
            onChange={(e) => {
              const c = candidates.find((x) => x.id === e.target.value);
              if (c) onPickInstitution(c);
            }}
          >
            <option value="" disabled>
              Select…
            </option>
            {candidates.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
      )}

      {contract.notes.length > 0 && (
        <ul className="mt-4 space-y-2">
          {contract.notes.map((n) => (
            <li key={n} className="flex gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
              <Info aria-hidden className="mt-0.5 size-4 shrink-0" />
              <span>{n}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
