# 07 — Screens & Design System

**One visual idea: a money bar that always shows Held · Sent · Released.** Every screen reuses the money
bar, the same status chips and the same trace drawer. Calm and trustworthy, not flashy.

## Design tokens

- One accent colour (deep teal, e.g. `#0F766E`), neutral greys, red only for blocked, amber for approval.
- Large tabular numerals for money (`font-variant-numeric: tabular-nums`), generous spacing.
- Font: Inter or system UI. Tailwind + shadcn/ui (Button, Card, Badge, Dialog, Sheet, Tabs, Switch, Table, Tooltip).
- Status chip = icon + word + colour, never colour alone:
  `Held 🔒` `Paying ⏳` `Paid ✓` `Blocked ⛔` `Needs approval ✋` `Voided ↩` `Expired ⌛` `Paused ⏸` (use lucide icons, not emoji).
- Persistent header: logo "Earmark", **Persona switcher** (Sender / School / Recipient / Judge), **Sandbox**
  badge, AI mode toggle (Fixture/Live), Reset button (judge mode).

## Shared components (`src/components/`)

| Component | Spec |
|---|---|
| `MoneyBar` | Horizontal stacked bar, 3 segments: Held (teal outline), Sent (solid teal), Released (grey). Labels with big numerals underneath. Animates on change. Optional `≈ KES (estimate)` sub-label. |
| `StatusChip` | As above |
| `ContractPanel` | Renders `IntentContract` as a readable card: "Pay **Lakeview Secondary School** · up to **$400** · for **Term 1 fees (Brian)** · until **Nov 5** · needs **signed invoice** · ask me above **$400**". Shows `notes` as amber hints and unresolved payee warning. |
| `RuleChecklist` | List of `RuleResult` with ✓ / ✗ / ! icons, title, reason, expected vs actual. Blocking rule highlighted. |
| `TraceDrawer` | Right-side Sheet. Vertical timeline of steps: actor avatar (Guardian, Gate, Orchestrator, PayPal, Extractor), plain-language line, expandable JSON. PayPal calls show method + path + Request-Id + debug_id. Extractor step shows a "No tools" badge. |
| `EventTimeline` | Compact list of events with hashes truncated (`a3f9…`) |
| `PersonaSwitcher`, `SandboxBadge` | — |

## Screens

| # | Route | Persona | Must show |
|---|---|---|---|
| 1 | `/compose` | Sender | Left: sentence textarea with 3 example chips. Right: live `ContractPanel` (debounced compile 600ms or "Compile" button). Bottom: Approve contract → PayPal Buttons (authorize). Money bar previews "$400 will be held". |
| 2 | `/earmarks/[id]` | Sender | Header with chip + MoneyBar. Tabs: Timeline · Invoices · Contract. Pause switch (prominent). "Upload invoice" (legacy). "Open trace". Share links: recipient view, proof receipt, school link. |
| 3 | `/invoices/[id]` | Sender | Two columns: invoice image/PDF preview with extracted fields highlighted (bounding boxes optional; a field list with confidence bars is fine) · `RuleChecklist` + verdict banner + Approve / Reject (when REQUIRE_APPROVAL). |
| 4 | `/school` | School | Pick an Earmark reference (seeded list), line items form (prefilled Term 1 fees $350), "Issue signed invoice". Below: table of issued invoices with Paid/Blocked chips. Shows "Signed with key ins_lakeview ✓". |
| 5 | `/r/[id]` | Recipient | **Mobile-first** single card: "Your Term 1 fees were paid to Lakeview Secondary School — $350, 2 Nov". EN/SW toggle. Big "Confirm I see this" button → thank-you state. |
| 6 | `/receipt/[id]` | Public | Title, summary card, MoneyBar, event chain list with each hash; **Verified** badge computed client-side (spinner → ✓ "Chain verified: 14 events" or ✗ "Broken at event #7"). Copy link button. No sender PII beyond first name. |
| 7 | `/ledger` | Sender | AG Grid (Community). Master rows = Earmarks: beneficiary, institution, cap, sent, released, status chip, created, # invoices, # blocked. Detail = invoices + payments + last rule result. Quick filter, column filters, "Blocked attempts" preset filter button. Summary cards above: total held / sent / released / blocked attempts. |
| 8 | `/lab` | Judge | 5 scenario cards (title, one-line attack, "Run attack"). Running shows live steps; result card shows ⛔ + the rule id/title/reason that fired + "Open trace". "Run all" button. Footer: eval pass rate badge from `evals/RESULTS.md`. |

AG Grid note: master/detail is an Enterprise feature. With **Community**, implement detail via
`fullWidth` rows or `isFullWidthRow` + a custom renderer toggled by clicking a row (or expand into a side
Sheet). Verify licence terms before using any enterprise module — we want the AG Grid sponsor prize, so
stay Community-clean.

## States

Every screen needs: loading skeleton, empty state (with a one-line explanation + primary action), error
state (with PayPal `debug_id` when relevant). Recipient view must look good at 360px wide.

## Accessibility

Contrast AA, focus rings, buttons are `<button>`, chips have text, receipt verification result is announced
(`aria-live="polite"`).
