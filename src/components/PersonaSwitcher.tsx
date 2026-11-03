"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

// Sender / School / Recipient / Judge — each persona is a set of routes (docs/07-UI-SCREENS.md).
const PERSONAS = [
  { label: "Sender", href: "/compose", matches: ["/compose", "/earmarks", "/invoices", "/ledger"] },
  { label: "School", href: "/school", matches: ["/school"] },
  { label: "Recipient", href: "/r/em_demo", matches: ["/r/"] },
  { label: "Judge", href: "/lab", matches: ["/lab", "/receipt"] },
];

export function PersonaSwitcher() {
  const path = usePathname();
  return (
    <nav aria-label="Persona" className="flex rounded-lg border bg-muted p-0.5 text-sm">
      {PERSONAS.map((p) => {
        const active = p.matches.some((m) => path.startsWith(m));
        return (
          <Link
            key={p.label}
            href={p.href}
            aria-current={active ? "page" : undefined}
            className={`rounded-md px-2.5 py-1 transition-colors ${active ? "bg-background font-medium shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
          >
            {p.label}
          </Link>
        );
      })}
    </nav>
  );
}
