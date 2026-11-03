# 11 — Deployment (Render) & Environment

## Environment variables (`.env.example` is the source of truth)

| Var | Example | Notes |
|---|---|---|
| `PAYPAL_MODE` | `mock` / `sandbox` | |
| `AI_MODE` | `fixture` / `live` | Hosted judge demo defaults to `fixture` with a header toggle to `live` |
| `PAYOUT_MODE` | `real` / `simulated` | Fallback A only; UI labels simulated payouts |
| `PAYPAL_CLIENT_ID` / `PAYPAL_CLIENT_SECRET` | | Platform sandbox REST app |
| `NEXT_PUBLIC_PAYPAL_CLIENT_ID` | | Same client id, for the JS SDK |
| `PAYPAL_WEBHOOK_ID` | | From sandbox app after registering the Render URL |
| `PAYPAL_ACCESS_TOKEN` | | Only for the local MCP server in `.mcp.json` |
| `SCHOOL_PAYPAL_EMAIL` | `sb-lakeview@business.example.com` | Seeded into registry |
| `LOOKALIKE_PAYPAL_EMAIL` | | Seeded lookalike |
| `ANTHROPIC_API_KEY` | | |
| `ANTHROPIC_MODEL` | | Current Claude model id with vision; set once, quoted in README |
| `TICKET_SECRET` | 32+ random bytes hex | HMAC for capability tickets |
| `SCHOOL_PRIVATE_KEY` / `SCHOOL_PUBLIC_KEY` | base64 PEM | `pnpm keys` generates |
| `DEMO_RESET_TOKEN` | | Guards `/api/admin/*` outside judge mode |
| `JUDGE_MODE` | `true` | Shows reset/tamper buttons, lab hold labels |
| `KES_DISPLAY_RATE` | `129` | Display-only estimate, labelled as such |
| `DATABASE_PATH` | `.data/earmark.db` | |
| `APP_URL` | `https://earmark-xxxx.onrender.com` | Used for share links |

## Render

`render.yaml` (Blueprint):
```yaml
services:
  - type: web
    name: earmark
    runtime: node
    plan: free            # judging runs to Dec 15 — confirm free-tier limits (spin-down, no persistent disk)
    buildCommand: corepack enable && pnpm install --frozen-lockfile && pnpm build
    startCommand: pnpm db:reset && pnpm start
    healthCheckPath: /api/health
    envVars:
      - key: NODE_VERSION
        value: 20
      - key: PAYPAL_MODE
        value: sandbox
      - key: AI_MODE
        value: fixture
      - key: JUDGE_MODE
        value: "true"
      - fromGroup: earmark-secrets
```
- Free instances spin down when idle → first request is slow. README tells judges to wait ~30–60 s, or
  add a free uptime pinger. Data resets on restart; that's intended (seed on boot).
- `better-sqlite3` builds natively on Render's Node image; if build fails, pin a version with prebuilt binaries.
- After first deploy: register `https://<app>/api/paypal/webhook` in the sandbox app → copy webhook id →
  set `PAYPAL_WEBHOOK_ID` → redeploy.

## Hosted-demo hardening

- Rate limit write routes; cap upload size (5 MB, pdf/png/jpg only).
- `AI_MODE=live` toggle per session with a hard daily budget counter (e.g. 200 live calls/day) → falls back to fixture.
- No secrets in client bundles (`pnpm build` then grep `.next/static` for `PAYPAL_CLIENT_SECRET`, `sk-ant` in CI).
- Fresh-clone dry run (`docs/13`): time it; must be < 10 min.
