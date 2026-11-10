import { Building2, FileCheck2, FlaskConical, Lock, PenLine, ShieldCheck, Smartphone, Table2 } from "lucide-react";
import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { DEMO_EARMARK_ID } from "@/lib/db/seed";

const STEPS = [
  { n: 1, icon: PenLine, who: "Sender", title: "Write the purpose", text: "One sentence becomes a contract you can read. Approve it, and PayPal holds the money: held, not sent.", href: "/compose", cta: "Compose" },
  { n: 2, icon: Building2, who: "School", title: "Send a signed invoice", text: "The school's agent signs the invoice. Seventeen rules check it, then the exact amount is paid and the rest released.", href: `/school?ref=${DEMO_EARMARK_ID}`, cta: "School console" },
  { n: 3, icon: Smartphone, who: "Recipient", title: "See it was paid", text: "The family gets a short message in English or Kiswahili, and confirms they saw it.", href: `/r/${DEMO_EARMARK_ID}`, cta: "Recipient view" },
  { n: 4, icon: ShieldCheck, who: "Anyone", title: "Check the proof", text: "Your browser re-computes every hash in the log. Change one byte and the receipt breaks.", href: `/receipt/${DEMO_EARMARK_ID}`, cta: "Proof receipt" },
  { n: 5, icon: FlaskConical, who: "Judge", title: "Attack it", text: "Swapped accounts, inflated totals, reused invoices, hidden AI instructions. See which rule stops each one.", href: "/lab", cta: "Attack Lab" },
];

const PROMISES = [
  { icon: Lock, text: "The model never decides money. A deterministic gate does." },
  { icon: FileCheck2, text: "Payouts go only to the school's registered account, never to one printed on an invoice." },
  { icon: Table2, text: "Every step is on an append-only, hash-chained log." },
];

export default function Home() {
  return (
    <main className="mx-auto max-w-5xl px-4 py-14">
      <h1 className="max-w-2xl text-4xl font-semibold tracking-tight">Money that remembers why it was sent.</h1>
      <p className="mt-4 max-w-2xl text-lg text-muted-foreground">Hold funds for a purpose. Pay only a verified invoice. Release the rest. Prove every step.</p>
      <div className="mt-8 flex flex-wrap gap-3">
        <Link href="/compose" className={buttonVariants({ size: "lg" })}>
          Earmark money
        </Link>
        <Link href={`/earmarks/${DEMO_EARMARK_ID}`} className={buttonVariants({ size: "lg", variant: "outline" })}>
          Open the demo Earmark
        </Link>
        <Link href="/ledger" className={buttonVariants({ size: "lg", variant: "ghost" })}>
          Ledger
        </Link>
      </div>

      <ul className="mt-10 grid gap-3 sm:grid-cols-3">
        {PROMISES.map((p) => (
          <li key={p.text} className="flex gap-2 rounded-xl bg-teal-50 p-4 text-sm text-teal-950">
            <p.icon aria-hidden className="mt-0.5 size-4 shrink-0 text-teal-700" />
            {p.text}
          </li>
        ))}
      </ul>

      <h2 className="mt-14 text-lg font-semibold">Try it in two minutes</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        The demo Earmark holds $400 for Brian&apos;s Term 1 fees at Lakeview Secondary School (fictional). Follow the steps in order; Reset in the header starts over.
      </p>
      <ol className="mt-5 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {STEPS.map((s) => (
          <li key={s.n} className="flex flex-col rounded-xl border p-5">
            <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              <span className="flex size-6 items-center justify-center rounded-full bg-primary text-primary-foreground">{s.n}</span>
              <s.icon aria-hidden className="size-4" />
              {s.who}
            </div>
            <h3 className="mt-3 font-medium">{s.title}</h3>
            <p className="mt-1 flex-1 text-sm text-muted-foreground">{s.text}</p>
            <Link href={s.href} className="mt-4 text-sm font-medium text-primary underline-offset-4 hover:underline">
              {s.cta} →
            </Link>
          </li>
        ))}
      </ol>
    </main>
  );
}
