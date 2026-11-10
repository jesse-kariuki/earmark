"use client";
import { CircleCheck, Loader, Lock } from "lucide-react";
import { useState } from "react";
import { api } from "@/lib/http/client";

export interface RecipientCardProps {
  earmarkId: string;
  paid: boolean;
  headline: { en: string; sw: string };
  message: { en: string; sw: string };
  amount: string | null;
  institution: string;
  date: string | null;
  confirmed: boolean;
}

const COPY = {
  en: { confirm: "Confirm I see this", thanks: "Thank you. The sender can see you confirmed.", paidTo: "Paid to", held: "Held for", on: "on" },
  sw: { confirm: "Thibitisha nimeona", thanks: "Asante. Mtumaji anaona umethibitisha.", paidTo: "Imelipwa kwa", held: "Imehifadhiwa kwa", on: "tarehe" },
} as const;

/** Mobile-first single card (docs/07 screen 5). Works at 360px wide. */
export function RecipientCard(p: RecipientCardProps) {
  const [lang, setLang] = useState<"en" | "sw">("en");
  const [confirmed, setConfirmed] = useState(p.confirmed);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const t = COPY[lang];

  async function confirm() {
    setBusy(true);
    setError(null);
    const r = await api(`/api/r/${p.earmarkId}/confirm`);
    setBusy(false);
    if (r.ok) setConfirmed(true);
    else setError(r.error.message);
  }

  return (
    <article className="mx-auto w-full max-w-md rounded-2xl border bg-white p-5 shadow-sm">
      <div className="flex justify-end">
        <div role="group" aria-label="Language" className="flex rounded-lg border bg-muted p-0.5 text-xs">
          {(["en", "sw"] as const).map((l) => (
            <button key={l} type="button" aria-pressed={lang === l} onClick={() => setLang(l)} className={`rounded-md px-2.5 py-1 ${lang === l ? "bg-background font-medium shadow-sm" : "text-muted-foreground"}`}>
              {l === "en" ? "English" : "Kiswahili"}
            </button>
          ))}
        </div>
      </div>
      <div className={`mx-auto mt-4 flex size-14 items-center justify-center rounded-full ${p.paid ? "bg-teal-700 text-white" : "bg-teal-50 text-teal-800"}`}>
        {p.paid ? <CircleCheck aria-hidden className="size-8" /> : <Lock aria-hidden className="size-7" />}
      </div>
      <h1 className="mt-4 text-center text-xl font-semibold leading-snug">{p.headline[lang]}</h1>
      {p.amount && <p className="mt-3 text-center text-4xl font-semibold tabular-nums tracking-tight">{p.amount}</p>}
      <p className="mt-2 text-center text-sm text-muted-foreground">
        {p.paid ? t.paidTo : t.held} {p.institution}
        {p.date && ` ${t.on} ${p.date}`}
      </p>
      <p className="mt-4 rounded-lg bg-zinc-50 p-3 text-sm leading-relaxed">{p.message[lang]}</p>
      {p.paid &&
        (confirmed ? (
          <p role="status" className="mt-5 flex items-center justify-center gap-2 rounded-xl bg-teal-50 p-4 text-center text-sm font-medium text-teal-900">
            <CircleCheck aria-hidden className="size-5" />
            {t.thanks}
          </p>
        ) : (
          <button type="button" disabled={busy} onClick={() => void confirm()} className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-4 text-base font-semibold text-primary-foreground disabled:opacity-60">
            {busy && <Loader aria-hidden className="size-5 animate-spin" />}
            {t.confirm}
          </button>
        ))}
      {error && (
        <p role="alert" className="mt-2 text-center text-sm text-red-700">
          {error}
        </p>
      )}
    </article>
  );
}
