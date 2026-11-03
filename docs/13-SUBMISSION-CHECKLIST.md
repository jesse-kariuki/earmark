# 13 — Submission Checklist & Prizes

**Submit on Nov 11. Official deadline: Nov 12, 12:00 pm Pacific = 11:00 pm Nairobi.** Nov 12 is buffer only.

## Checklist

- [ ] Public repo (GitHub) with an OSI licence (MIT) detectable in the About section
- [ ] README: pitch, screenshots/GIF, architecture diagram, how PayPal is used (each API + Agent Toolkit + MCP),
      how AI is used (and what it is NOT allowed to do), setup & run steps, env vars, sandbox test accounts,
      eval results table, test count + coverage, limitations (sandbox only, 3-day honor period, not escrow,
      licensing needed in production), roadmap (M-Pesa/bank payouts, re-authorization, installments)
- [ ] Working demo: Render URL + reset button; instructions complete enough to run locally
- [ ] Video < 3:00, public YouTube, no copyrighted music, no third-party trademarks
- [ ] Devpost text: features, PayPal + AI usage, statement that it was built during the submission period
- [ ] Sponsor tools ticked: PayPal (Agent Toolkit/MCP), AG Grid, Render (+ APIMatic only if done)
- [ ] Secrets scrubbed from history (`gitleaks detect`), `.env` never committed
- [ ] Fresh clone + logged-out browser test done, timed (< 10 min)
- [ ] `pnpm test`, `pnpm eval`, `pnpm e2e` green on the submitted commit; tag `v1.0-submission`

## Prize strategy

One project can win a Grand Prize **or** Honorable Mention, plus **one** Sponsor Prize.

| Prize | Why Earmark fits | Action |
|---|---|---|
| Grand ($12k / $8k / $5k) | Complete, working, specific | Main goal |
| Most Creative | Intent Contracts + Attack Lab | Emphasise in pitch |
| Most Impactful | One audience, one pain, Kenya figure | Keep story concrete |
| Best Use of Agentic Commerce | Guardian ↔ Registrar settlement | Build connected mode |
| Best Use of PayPal + AI | Authorize/capture/payout driven by a guarded agent | Show PayPal calls in trace |
| Best Demo Delivery | Story-led video | Reserve 2 days |
| AG Grid ($5k) | Ledger | Small and cheap — do it well |
| Render (credits) | Hosting | Nearly free |
| APIMatic | Institution API SDK/docs | Only if time remains (`public/openapi.yaml` makes it quick) |
| Zapier, Postman, Bryntum, Channel3 | No natural fit | Skip |
