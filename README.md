# Earmark: money that remembers why it was sent

> *Send money with a reason, and keep the reason attached.*
> Built for the PayPal AI Hackathon (2026). **Sandbox only. All names are fictional.**

**Code:** [github.com/jesse-kariuki/earmark](https://github.com/jesse-kariuki/earmark) · **Run it:** [locally in < 10 minutes](#run-it-locally--10-minutes), no keys needed · **Video (2:53):** _YouTube link added at submission_ · **Licence:** [MIT](LICENSE)

![Home](docs/screenshots/home.png)

## The problem
Families abroad send money for specific things (school fees, hospital bills, rent) but cannot verify where it
ends up. Kenya alone received a record US$5.04 billion in diaspora remittances in 2025 (Central Bank of Kenya).
Once money is sent, the reason it was sent is lost.

## What Earmark does
1. **Intent Contracts.** Write a sentence ("Pay Brian's Term 1 fees at Lakeview Secondary School, up to $400, only
   against a real invoice"). An LLM (Gemini or Claude, via the Vercel AI SDK) compiles it into rules you can read and approve; the approved contract is frozen by its hash.
2. **Held, not sent.** A PayPal authorization holds the money. Only the verified invoice amount is captured; the rest is released.
3. **Two-agent settlement.** The school's **Registrar** agent signs an invoice with an Ed25519 key. The sender's **Guardian**
   agent checks the hold in PayPal's own record, reads the gate's verdict and proposes payment. A deterministic gate decides.
4. **Legacy invoices too.** Upload a PDF or photo. A quarantined extractor with no tools reads it; 17 named rules check it; the sender approves.
5. **Attack Lab.** Run real attacks yourself (swapped payout account, inflated total, reused invoice, expired Earmark,
   prompt injection, forged signature, agent overpay) and see which rule stops each one.
6. **Proof Receipt.** Every step goes on an append-only, hash-chained log that your browser re-verifies. Tamper with one event and the receipt breaks at that event.

| Compose | Trace (who did what, PayPal Request-Ids, "No tools") |
|---|---|
| ![Compose](docs/screenshots/compose.png) | ![Trace](docs/screenshots/trace.png) |
| **Blocked invoice: rule checklist** | **Attack Lab: 7/7 blocked** |
| ![Invoice](docs/screenshots/invoice-blocked.png) | ![Lab](docs/screenshots/lab.png) |
| **Ledger (AG Grid Community)** | **Proof Receipt** |
| ![Ledger](docs/screenshots/ledger.png) | ![Receipt](docs/screenshots/receipt.png) |

## How PayPal is used
| Step | API |
|---|---|
| Hold | Orders v2 `intent: AUTHORIZE` + `/authorize`, from PayPal JS SDK Buttons (`@paypal/react-paypal-js`) |
| Capture the exact invoice amount | Payments v2 `/authorizations/{id}/capture` with `final_capture: true` (the remainder is released) |
| Pay the school | Payouts v1 `/payments/payouts`, always to the **registry** email, never to one printed on an invoice |
| Cancel / expire | Payments v2 `/authorizations/{id}/void` |
| Confirm | Webhooks (`/v1/notifications/verify-webhook-signature`, deduped by event id) with a polling fallback |
| Agent tools | `@paypal/agent-toolkit` 1.11.0, read-only `get_order` and `list_transactions`, used by the Guardian to confirm the hold |
| Development | PayPal MCP server (`npx -y @paypal/mcp`) to inspect sandbox orders and transactions |

Every write carries a `PayPal-Request-Id` derived from the payment and step (`pay_123:capture`, `pay_123:payout`), and
`sender_batch_id` is the payment id. Retries reuse the same ids, so a replayed invoice or a retry after a network error never pays twice.

## How AI is used, and what it is not allowed to do
| The model does | Code does |
|---|---|
| Sentence → contract draft (Zod-validated) | Resolves the payee by exact registry match (no fuzzy matching), applies defaults, freezes by hash |
| Reads an invoice image/PDF (**no tools**, temperature 0) | Cross-checks against contract, registry, previous invoices, arithmetic, confidence floor |
| Guardian: chooses the next step with tools | Every proposal goes through the gate; the gate mints a single-use, HMAC-signed, 5-minute ticket |
| Writes the recipient message (EN + Kiswahili) | Rejects any message that mentions an amount, email or institution not in the event log |

The model **never decides or moves money**. `src/lib/policy/gate.ts` is pure and deterministic. Only `src/lib/orchestrator/`
may import the money-moving PayPal client (an ESLint rule plus a guardrail test). The Guardian has no capture, payout or void
tool, and it never sees raw invoice text, only structured fields and rule ids. Hidden instructions in an invoice are a block rule (R13).

## Tools used
| Tool | How it is used |
|---|---|
| **Google Gemini** (`gemini-3.5-flash`) via `@ai-sdk/google` | Live AI provider used to build this submission: it compiled the demo sentence into the Intent Contract shown in the video (recorded in `evals/fixtures/recorded/contract.compile/`). Set `AI_PROVIDER=google`. |
| **Anthropic Claude** via `@ai-sdk/anthropic` | Alternative live provider (`AI_PROVIDER=anthropic`, the default) for the same four jobs: contract compile, quarantined invoice extraction (vision, no tools), the Guardian agent (tool calling) and the recipient message. |
| **Vercel AI SDK** (`ai` v7) | `generateText` + `Output.object` with Zod schemas for every model output; tool calling for the Guardian. |
| **PayPal REST APIs** (sandbox) | Orders v2 (authorize), Payments v2 (capture / void), Payouts v1, Webhooks. Our own thin `fetch` client with `PayPal-Request-Id` on every write. |
| **PayPal JS SDK** (`@paypal/react-paypal-js`) | The PayPal button and approval popup that place the hold. |
| **PayPal Agent Toolkit** (`@paypal/agent-toolkit` 1.11.0) | The Guardian's read-only `get_order` / `list_transactions` tools, to confirm the hold in PayPal's own record before it may propose a payment. |
| **PayPal MCP server** (`@paypal/mcp`) | Development: inspecting sandbox orders and transactions. |
| **Claude Code** | AI coding assistant used to write and test the code. |
| **edge-tts** (Microsoft neural voice `en-KE-ChilembaNeural`), **Playwright**, **ffmpeg** | The demo video pipeline: narration, screen recording and assembly (`npm run demo`). |

Modes, so judges can run it without keys: `AI_MODE=fixture` replays recorded or hand-authored model outputs keyed by input
hash (the Guardian then follows a fixed script through the same tools and gate), and `AI_MODE=live` calls the model.
`PAYPAL_MODE=mock` is an in-memory PayPal with the same interface; `PAYPAL_MODE=sandbox` is the real PayPal sandbox (used for the video).

## Results
- **Tests:** 429 unit/integration (Vitest) + 12 end-to-end (Playwright) · policy gate 100% line and branch coverage
- **Sandbox:** the full flow runs against the real PayPal sandbox: $200 hold → altered invoice blocked (R12) → $150 captured, $50 released, $150 paid out to the school (payout `SUCCESS`), confirmed on sandbox.paypal.com
- **Evals:** 12/12 invoices, 10/10 contracts in fixture mode (recorded outputs). Live-model numbers: see `evals/RESULTS.md` once recorded.
- **Attack Lab:** 5/5 required scenarios blocked, plus 2 bonus (7/7), each naming its rule

## Run it locally (< 10 minutes)
Needs Node 20+ and pnpm (`corepack enable` provides the pinned pnpm 10). No accounts or keys for the default mode.
```bash
git clone https://github.com/jesse-kariuki/earmark.git && cd earmark
cp .env.example .env          # works as-is: PAYPAL_MODE=mock, AI_MODE=fixture, no keys needed
pnpm install
pnpm db:reset
pnpm dev                      # http://localhost:3000
pnpm test && pnpm eval        # offline, deterministic
pnpm exec playwright install chromium && pnpm e2e   # builds and runs the Playwright suite on :3100
```
**Try it (about 3 minutes):** use the persona switcher in the header.
1. **Sender** → Compose: type a purpose, *Compile contract*, *Approve*, *Hold with PayPal* (one click in mock mode).
2. **School** → issue a signed invoice for that Earmark (try *Demo: alter it after signing* first: it is blocked by R12), then a genuine one: it is paid and the rest is released. *Open trace* shows every agent and PayPal step.
3. **Recipient** → the family's view (English / Kiswahili).
4. **Judge** → Attack Lab, *Run all*: 7 attacks, each blocked by a named rule. Then a Proof Receipt → *Simulate tampering*.

Real sandbox: set `PAYPAL_MODE=sandbox` and fill `PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET`, `NEXT_PUBLIC_PAYPAL_CLIENT_ID`,
`SCHOOL_PAYPAL_EMAIL` (a sandbox business account), and `PAYPAL_WEBHOOK_ID` for webhooks. Live AI: `AI_MODE=live` with
`ANTHROPIC_API_KEY` + `ANTHROPIC_MODEL`, or with `AI_PROVIDER=google` + `GOOGLE_GENERATIVE_AI_API_KEY` + `GOOGLE_MODEL` (Gemini free tier); then `AI_RECORD=1 pnpm eval:live` records outputs that fixture mode replays.
If you change `SCHOOL_PAYPAL_EMAIL`, run `pnpm fixtures` so the sample invoices print the same account.

| Command | What it does |
|---|---|
| `pnpm paypal:smoke` | Real sandbox: authorize → partial final capture → payout → void |
| `pnpm keys` | Dev Ed25519 keypair for the school |
| `pnpm fixtures` | Regenerates the 12 synthetic eval invoices |

## Demo video pipeline
`npm run demo` rebuilds the video from scratch: it narrates `demo/script.md` (your own clips in `demo/voice/scene-N.wav`
or `.mp3/.m4a/.ogg/.flac` win per scene; otherwise edge-tts with the male voice `en-KE-ChilembaNeural`, falling back to `en-US-GuyNeural`,
then a local TTS; `pip install edge-tts`), starts the app on :3200 with a fresh demo DB, records the 10 scenes with
Playwright, then assembles `demo/out/earmark-demo.mp4` with ffmpeg (title card, narration at each scene's timestamp,
burned-in captions, end card). Set `DEMO_TEAM` and `DEMO_REPO_URL` for the end card. With `PAYPAL_MODE=sandbox` it
drives the real PayPal popup using `PAYPAL_SANDBOX_BUYER_EMAIL` / `PAYPAL_SANDBOX_BUYER_PASSWORD`, and films the buyer's
real balance on sandbox.paypal.com before the hold, after it, after the blocked attempt and after payment
(−$200 / −$200 / −$150 since the start; readings in `demo/out/timings.json`). Each sandbox run really moves $150 of
sandbox money.

## Architecture
```mermaid
flowchart LR
  S[Sender] -->|sentence| C1[Intent compiler<br/>LLM → Zod]
  S -->|upload| X[Quarantined extractor<br/>LLM vision, no tools]
  SC[School] --> REG[Registrar agent<br/>Ed25519 signature]
  REG --> V[Signature verify]
  X --> G[Policy gate<br/>17 pure rules]
  V --> G
  G --> GU[Guardian agent<br/>read tools + proposePayment]
  GU -->|proposePayment| G
  G -->|single-use ticket| O[Orchestrator]
  O -->|capture · payout · void| PP[(PayPal sandbox)]
  PP -->|webhooks| O
  GU -.->|get_order| TK[(PayPal Agent Toolkit)]
  O --> LOG[(Hash-chained event log)]
  LOG --> RC[Proof Receipt<br/>verified in browser]
```
Details: `docs/01-ARCHITECTURE.md`. Rules: `docs/05-POLICY-GATE.md`.

## Limitations (honest)
- Sandbox only. Holding and redistributing funds for others needs licensing and a partner model in production; this is not escrow.
- PayPal authorizations are honoured for 3 days (valid 29), so demo Earmarks are short. Re-authorization is roadmap.
- One invoice per Earmark (final capture). Installments across terms are roadmap.
- An uploaded invoice is only as trustworthy as the sender's approval; signed invoices are bound by the school's key.
- A blocked upload still claims its invoice number, so a later genuine invoice with the same number is flagged as a duplicate (R09).
- KES amounts are display estimates, not FX quotes. Payouts go to PayPal accounts; M-Pesa and bank rails are roadmap.

## Roadmap
M-Pesa / bank payouts · re-authorization past the honor period · installments · more institution types (hospitals, landlords) · APIMatic SDK from `public/openapi.yaml`.

## Built during the submission period
All code in this repository was written during the hackathon submission period.
