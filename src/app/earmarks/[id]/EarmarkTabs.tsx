"use client";
import { type ReactNode, useState } from "react";

const TABS = ["timeline", "invoices", "contract"] as const;
type Tab = (typeof TABS)[number];

export function EarmarkTabs(panels: Record<Tab, ReactNode>) {
  const [tab, setTab] = useState<Tab>("timeline");
  return (
    <div className="mt-8">
      <div role="tablist" aria-label="Earmark details" className="flex gap-1 border-b">
        {TABS.map((t) => (
          <button
            key={t}
            id={`tab-${t}`}
            type="button"
            role="tab"
            aria-selected={tab === t}
            aria-controls={`panel-${t}`}
            onClick={() => setTab(t)}
            className={`-mb-px border-b-2 px-3 py-2 text-sm capitalize ${
              tab === t ? "border-primary font-medium" : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            {t}
          </button>
        ))}
      </div>
      {TABS.map((t) => (
        <div key={t} id={`panel-${t}`} role="tabpanel" aria-labelledby={`tab-${t}`} hidden={tab !== t} className="pt-4">
          {panels[t]}
        </div>
      ))}
    </div>
  );
}
