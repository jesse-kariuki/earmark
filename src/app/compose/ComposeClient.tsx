"use client";
import { Loader2, Sparkles } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ContractPanel, type ContractWarning } from "@/components/ContractPanel";
import { MoneyBar } from "@/components/MoneyBar";
import { HoldWithPayPal } from "@/components/HoldWithPayPal";
import { Button } from "@/components/ui/button";
import type { IntentContract } from "@/lib/contract/schema";
import { moneyBar } from "@/lib/earmarks/summary";
import { api } from "@/lib/http/client";

const EXAMPLES = [
  "Pay Brian's Term 1 fees at Lakeview Secondary School, up to $400, only against a real invoice.",
  "Send up to $350 to Riverbend Academy for Kevin's Term 1 2027 school fees. Only pay a signed invoice.",
  "Pay Lakeview Secondary Schools Ltd up to $400 for Brian's fees.",
];

interface Compiled {
  contract: IntentContract;
  warnings: ContractWarning[];
  candidates: { id: string; name: string }[];
  meta: { source: string; model: string };
}

export function ComposeClient({
  paypalMode,
  paypalClientId,
  kesRate,
}: {
  paypalMode: "mock" | "sandbox";
  paypalClientId: string | null;
  kesRate: number;
}) {
  const router = useRouter();
  const [sentence, setSentence] = useState("");
  const [senderName, setSenderName] = useState("Grace Kamau");
  const [compiled, setCompiled] = useState<Compiled | null>(null);
  const [pickedName, setPickedName] = useState<string | undefined>();
  const [busy, setBusy] = useState<"compile" | "approve" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [earmarkId, setEarmarkId] = useState<string | null>(null);

  async function compile(text = sentence) {
    setBusy("compile");
    setError(null);
    setCompiled(null);
    setPickedName(undefined);
    const r = await api<Compiled>("/api/contracts/compile", { sentence: text });
    setBusy(null);
    if (r.ok) setCompiled(r.data);
    else setError(r.error.message);
  }

  async function approve() {
    if (!compiled) return;
    setBusy("approve");
    setError(null);
    const created = await api<{ id: string }>("/api/earmarks", {
      sentence,
      contract: compiled.contract,
      senderName,
      recipientName: compiled.contract.purpose.beneficiary,
    });
    if (!created.ok) {
      setBusy(null);
      setError(created.error.message);
      return;
    }
    const approved = await api(`/api/earmarks/${created.data.id}/approve-contract`);
    setBusy(null);
    if (!approved.ok) {
      setError(approved.error.message);
      return;
    }
    setEarmarkId(created.data.id);
  }

  const contract = compiled?.contract;
  const unresolved = contract?.payee.institutionId === null;

  return (
    <main className="mx-auto grid max-w-6xl gap-8 px-4 py-10 lg:grid-cols-2">
      <section aria-labelledby="compose-h">
        <h1 id="compose-h" className="text-2xl font-semibold tracking-tight">
          Earmark money
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">Say what the money is for. Nothing moves until a real invoice arrives.</p>

        <label className="mt-6 block text-sm font-medium" htmlFor="sentence">
          Purpose
        </label>
        <textarea
          id="sentence"
          rows={4}
          value={sentence}
          disabled={earmarkId !== null}
          onChange={(e) => setSentence(e.target.value)}
          placeholder="Pay Brian's Term 1 fees at Lakeview Secondary School, up to $400…"
          className="mt-1 w-full rounded-lg border bg-background p-3 text-base"
        />
        <div className="mt-2 flex flex-wrap gap-2">
          {EXAMPLES.map((ex) => (
            <button
              key={ex}
              type="button"
              disabled={earmarkId !== null}
              onClick={() => {
                setSentence(ex);
                void compile(ex);
              }}
              className="max-w-full truncate rounded-full border px-3 py-1 text-left text-xs text-muted-foreground hover:bg-muted"
              title={ex}
            >
              {ex.length > 48 ? `${ex.slice(0, 48)}…` : ex}
            </button>
          ))}
        </div>

        <label className="mt-4 block text-sm font-medium" htmlFor="sender">
          Your name
        </label>
        <input
          id="sender"
          value={senderName}
          disabled={earmarkId !== null}
          onChange={(e) => setSenderName(e.target.value)}
          className="mt-1 w-full rounded-lg border bg-background px-3 py-2"
        />

        <Button className="mt-4" size="lg" disabled={sentence.trim().length < 10 || busy !== null || earmarkId !== null} onClick={() => compile()}>
          {busy === "compile" ? <Loader2 className="animate-spin" aria-hidden /> : <Sparkles aria-hidden />}
          Compile contract
        </Button>

        {error && (
          <p role="alert" className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-900">
            {error}
          </p>
        )}
      </section>

      <section aria-labelledby="contract-h" aria-live="polite">
        <h2 id="contract-h" className="text-sm font-medium text-muted-foreground">
          Contract
        </h2>
        {!contract && (
          <div className="mt-2 rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">
            {busy === "compile" ? "Reading your instruction…" : "Your contract appears here. Try an example on the left."}
          </div>
        )}
        {contract && compiled && (
          <div className="mt-2 space-y-6">
            <ContractPanel
              contract={contract}
              warnings={unresolved ? compiled.warnings : compiled.warnings.filter((w) => !w.code.startsWith("PAYEE_"))}
              candidates={compiled.candidates}
              institutionName={pickedName}
              onPickInstitution={(c) => {
                setPickedName(c.name);
                setCompiled({ ...compiled, contract: { ...contract, payee: { ...contract.payee, institutionId: c.id } } });
              }}
            />
            <p className="text-xs text-muted-foreground">
              Compiled by {compiled.meta.source === "live" ? compiled.meta.model : `recorded output (${compiled.meta.source})`}. The payee
              is matched by code against the verified registry, never by the AI.
            </p>

            <MoneyBar
              money={moneyBar({ status: "awaiting_authorization", capMinor: contract.capMinor, capturedMinor: 0, releasedMinor: 0 })}
              currency={contract.currency}
              kesRate={kesRate}
            />

            {!earmarkId ? (
              <Button size="lg" disabled={unresolved || busy !== null} onClick={approve}>
                {busy === "approve" && <Loader2 className="animate-spin" aria-hidden />}
                Approve contract
              </Button>
            ) : (
              <HoldWithPayPal
                earmarkId={earmarkId}
                paypalMode={paypalMode}
                clientId={paypalClientId}
                onHeld={() => router.push(`/earmarks/${earmarkId}`)}
              />
            )}
          </div>
        )}
      </section>
    </main>
  );
}
