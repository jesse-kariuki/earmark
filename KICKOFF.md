# How to start the Claude Code agent

## 1. Put this pack in a fresh repo
```bash
mkdir earmark && cd earmark
unzip ../earmark-starter.zip -d .     # CLAUDE.md, docs/, .claude/, PROGRESS.md, README.md, .env.example, .mcp.json
git init && git add -A && git commit -m "Earmark: specs and agent instructions"
```
Note: `create-next-app` refuses non-empty folders. The M0 instructions tell the agent to scaffold into a
temp dir and move files in (or use `pnpm dlx create-next-app@latest . --use-pnpm` after temporarily moving the docs).

## 2. Human-only setup (do in parallel with M0, ~30 min)
- developer.paypal.com → Sandbox: create **platform** (business, owns the REST app), **sender** (personal),
  **school** (business), **lookalike** (personal) accounts. Create a REST app on the platform account.
  Enable Payouts if offered. Note the client id/secret and the school/lookalike emails.
- console.anthropic.com → API key.
- render.com → account + connect GitHub.
- Fill `.env` from `.env.example` (leave modes on `mock`/`fixture` until M0 smoke passes).

## 3. First prompt to paste into Claude Code
```
Read CLAUDE.md, PROGRESS.md and docs/PLAN.md. We are starting milestone M0.
Scaffold the Next.js app into this repo without overwriting CLAUDE.md, docs/, .claude/, PROGRESS.md,
README.md, .env.example or .mcp.json. Then implement M0 exactly as specified, run /verify, and update
PROGRESS.md. Stop and tell me what you need when you reach the PayPal sandbox smoke test.
```
After that, each session is just: **`/next`**. Run **`/verify`** whenever you like, ask the
**money-reviewer** subagent to review after M3, M5 and M6, and run **`/presubmit`** on Nov 10.

## 4. Daily rhythm (Nov 2 → Nov 11)
- Morning: `/next` (one milestone, sometimes two).
- Evening: check `PROGRESS.md`, deploy to Render, click through the happy path yourself.
- Nov 9 end of day: feature freeze. Nov 10: hardening + video take 1. Nov 11: submit.
