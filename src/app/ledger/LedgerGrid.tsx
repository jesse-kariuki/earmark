"use client";
// The ledger (docs/07 screen 7) on AG Grid Community only: sorting, column filters, quick filter, an external
// "Blocked attempts" filter, and a side detail panel (master/detail is Enterprise, so we do not use it).
import { AllCommunityModule, type ColDef, type GridApi, type IRowNode, ModuleRegistry, themeQuartz } from "ag-grid-community";
import { AgGridReact } from "ag-grid-react";
import { Ban, ExternalLink, Search, X } from "lucide-react";
import Link from "next/link";
import { useCallback, useMemo, useRef, useState } from "react";
import { invoiceChip, StatusChip } from "@/components/StatusChip";
import { TraceDrawer } from "@/components/TraceDrawer";
import type { LedgerRow } from "@/lib/earmarks/ledger";
import type { TraceLine } from "@/lib/events/describe";
import { formatMoney } from "@/lib/money";

ModuleRegistry.registerModules([AllCommunityModule]);

const theme = themeQuartz.withParams({ accentColor: "#0F766E", fontFamily: "inherit", headerFontWeight: 600, rowHoverColor: "#f0fdfa" });

const money = (v: number | null | undefined) => (v === null || v === undefined ? "—" : formatMoney(v, "USD"));

export function LedgerGrid({ rows }: { rows: LedgerRow[] }) {
  const grid = useRef<GridApi<LedgerRow> | null>(null);
  const [quick, setQuick] = useState("");
  const [blockedOnly, setBlockedOnly] = useState(false);
  const blockedRef = useRef(false);
  const [selected, setSelected] = useState<LedgerRow | null>(null);
  const [trace, setTrace] = useState<{ id: string; lines: TraceLine[] } | null>(null);

  const columns = useMemo<ColDef<LedgerRow>[]>(
    () => [
      { field: "beneficiary", headerName: "Beneficiary", filter: "agTextColumnFilter", minWidth: 150, flex: 1 },
      { field: "institution", headerName: "Institution", filter: "agTextColumnFilter", minWidth: 180, flex: 1 },
      { field: "period", headerName: "For", filter: "agTextColumnFilter", width: 130 },
      { field: "capMinor", headerName: "Cap", filter: "agNumberColumnFilter", valueFormatter: (p) => money(p.value), width: 110, type: "rightAligned" },
      { field: "sentMinor", headerName: "Sent", filter: "agNumberColumnFilter", valueFormatter: (p) => money(p.value), width: 110, type: "rightAligned" },
      { field: "releasedMinor", headerName: "Released", filter: "agNumberColumnFilter", valueFormatter: (p) => money(p.value), width: 115, type: "rightAligned" },
      {
        field: "status",
        headerName: "Status",
        filter: "agTextColumnFilter",
        width: 150,
        cellRenderer: (p: { data?: LedgerRow }) =>
          p.data ? (
            <span className="inline-flex items-center gap-1">
              <StatusChip kind={p.data.status} />
              {p.data.frozen && <StatusChip kind="paused" />}
            </span>
          ) : null,
      },
      { field: "createdAt", headerName: "Created", filter: "agDateColumnFilter", sort: "desc", width: 120, valueFormatter: (p) => new Date(p.value as number).toLocaleDateString("en-GB", { day: "numeric", month: "short" }), filterValueGetter: (p) => new Date(p.data!.createdAt) },
      { field: "invoices", headerName: "Invoices", filter: "agNumberColumnFilter", width: 100, type: "rightAligned" },
      {
        field: "blocked",
        headerName: "Blocked",
        filter: "agNumberColumnFilter",
        width: 100,
        type: "rightAligned",
        cellRenderer: (p: { value?: number }) => (p.value ? <span className="font-medium text-red-700">{p.value}</span> : <span className="text-zinc-400">0</span>),
      },
      { field: "lastRule", headerName: "Last decision", filter: "agTextColumnFilter", width: 170, valueFormatter: (p) => (p.value ? String(p.value).replace(/_/g, " ").slice(0, 28) : "—") },
    ],
    [],
  );

  const toggleBlocked = useCallback(() => {
    blockedRef.current = !blockedRef.current;
    setBlockedOnly(blockedRef.current);
    grid.current?.onFilterChanged();
  }, []);

  async function openTrace(id: string) {
    const res = await fetch(`/api/earmarks/${id}/trace`).then((r) => r.json() as Promise<{ ok: boolean; data: TraceLine[] }>);
    if (res.ok) setTrace({ id, lines: res.data });
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <label className="relative min-w-0 flex-1">
          <span className="sr-only">Search the ledger</span>
          <Search aria-hidden className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-zinc-400" />
          <input
            value={quick}
            onChange={(e) => setQuick(e.target.value)}
            placeholder="Search beneficiary, school, status…"
            className="w-full rounded-lg border py-2 pl-9 pr-3 text-sm"
          />
        </label>
        <button
          type="button"
          aria-pressed={blockedOnly}
          onClick={toggleBlocked}
          className={`inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm ${blockedOnly ? "border-red-300 bg-red-50 text-red-800" : "hover:bg-muted"}`}
        >
          <Ban aria-hidden className="size-4" />
          Blocked attempts
        </button>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_22rem]">
        <div className="h-[520px] min-w-0" data-testid="ledger-grid">
          <AgGridReact<LedgerRow>
            theme={theme}
            rowData={rows}
            columnDefs={columns}
            quickFilterText={quick}
            getRowId={(p) => p.data.id}
            onGridReady={(e) => (grid.current = e.api)}
            isExternalFilterPresent={() => blockedRef.current}
            doesExternalFilterPass={(node: IRowNode<LedgerRow>) => (node.data?.blocked ?? 0) > 0}
            onRowClicked={(e) => e.data && setSelected(e.data)}
            rowSelection={{ mode: "singleRow", checkboxes: false, enableClickSelection: true }}
            defaultColDef={{ sortable: true, resizable: true, floatingFilter: false }}
            overlayNoRowsTemplate="No Earmarks match. Clear the search or the Blocked filter."
          />
        </div>

        <aside aria-label="Earmark detail" className="rounded-xl border p-4">
          {!selected ? (
            <p className="text-sm text-muted-foreground">Click a row to see its invoices, payments and the last rule result.</p>
          ) : (
            <div className="space-y-4">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="font-medium">{selected.beneficiary}</p>
                  <p className="text-xs text-muted-foreground">
                    {selected.institution} · {selected.period}
                  </p>
                </div>
                <button type="button" aria-label="Close detail" onClick={() => setSelected(null)} className="rounded p-1 hover:bg-muted">
                  <X aria-hidden className="size-4" />
                </button>
              </div>
              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={() => void openTrace(selected.id)} className="inline-flex items-center gap-2 rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground">
                  Open trace
                </button>
                <Link href={`/earmarks/${selected.id}`} className="inline-flex items-center gap-1 rounded-lg border px-3 py-1.5 text-sm hover:bg-muted">
                  Earmark <ExternalLink aria-hidden className="size-3.5" />
                </Link>
                <Link href={`/receipt/${selected.id}`} className="inline-flex items-center gap-1 rounded-lg border px-3 py-1.5 text-sm hover:bg-muted">
                  Receipt <ExternalLink aria-hidden className="size-3.5" />
                </Link>
              </div>
              <section>
                <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Invoices</h3>
                {selected.detail.invoices.length === 0 ? (
                  <p className="mt-1 text-sm text-muted-foreground">None stored{selected.blocked > 0 ? " (a blocked duplicate is never stored)" : ""}.</p>
                ) : (
                  <ul className="mt-1 space-y-2">
                    {selected.detail.invoices.map((i) => (
                      <li key={i.id} className="rounded-lg border p-2 text-sm">
                        <div className="flex items-center justify-between gap-2">
                          <Link href={`/invoices/${i.id}`} className="truncate text-primary underline-offset-4 hover:underline">
                            {i.number ?? i.id}
                          </Link>
                          <StatusChip kind={invoiceChip({ verdict: i.verdict, approvedBy: i.approvedBy, paid: selected.detail.payments.some((p) => p.status === "paid_out") && i.verdict === "ALLOW" })} />
                        </div>
                        <p className="text-xs text-muted-foreground">
                          {i.source} · {money(i.amountMinor)}
                        </p>
                        {i.firstFailing && (
                          <p className="mt-1 text-xs text-red-800">
                            {i.firstFailing.ruleId.slice(0, 3)} {i.firstFailing.title}: {i.firstFailing.reason}
                          </p>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </section>
              <section>
                <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Payments</h3>
                {selected.detail.payments.length === 0 ? (
                  <p className="mt-1 text-sm text-muted-foreground">None.</p>
                ) : (
                  <ul className="mt-1 space-y-1 font-mono text-xs">
                    {selected.detail.payments.map((p) => (
                      <li key={p.id}>
                        {p.id} · {money(p.amountMinor)} · {p.status}
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            </div>
          )}
        </aside>
      </div>
      {trace && <TraceDrawer key={trace.id} lines={trace.lines} initialOpen hideTrigger onClose={() => setTrace(null)} />}
    </div>
  );
}
