# Submission text (copy into the form)

## Project name
Earmark: money that remembers why it was sent

## Short description
Send money with a reason, and keep the reason attached. Earmark holds a PayPal payment until the school proves what it is
for, pays exactly the verified invoice, and gives the rest back. AI reads the purpose and the invoice; it never decides
or moves money.

## Text description (features and functionality)
Families abroad send money for specific things such as school fees, but once it is sent the reason is lost. Earmark keeps it.

- **Intent Contracts.** The sender writes one sentence ("Pay Brian's Term 1 school fees at Lakeview Secondary School, up to
  $200, only against a real invoice"). An LLM compiles it into a schema-validated contract the sender reads and approves; the
  payee is resolved by exact match against a registry of verified institutions, and the approved contract is frozen by hash.
- **Held, not sent.** Approving places a PayPal authorization: the money is held in the sender's PayPal account, not sent.
- **Two-agent settlement.** The school's Registrar agent issues an invoice signed with an Ed25519 key. The sender's Guardian
  agent confirms the hold in PayPal's own record (PayPal Agent Toolkit `get_order`) and can only *propose* a payment.
- **A deterministic gate decides.** 17 named rules (payout account matches the registry, within the cap, not a duplicate,
  valid signature, no instructions hidden in the invoice, ...) decide ALLOW / BLOCK / REQUIRE_APPROVAL. Only on ALLOW does the
  gate mint a single-use, HMAC-signed, 5-minute ticket that the orchestrator redeems exactly once to capture the exact invoice
  amount, pay the school's registered PayPal account through Payouts, and release the remainder to the sender.
- **Legacy invoices.** A photo or PDF invoice is read by a quarantined extractor with no tools; its output is cross-checked
  and the sender approves it.
- **Recipient view.** The family back home gets a short message in English or Kiswahili and confirms they saw it.
- **Attack Lab.** Seven real attacks (swapped payout account, inflated total, reused invoice, expired Earmark, prompt
  injection, forged signature, agent overpay) run through the real pipeline; each is blocked and names the rule that stopped it.
- **Proof Receipt.** Every step is appended to a hash-chained event log that the browser re-verifies; changing one event
  breaks the receipt at that event.
- **Idempotent by design.** Every PayPal write carries a `PayPal-Request-Id` derived from the payment and step, so retries
  and replays never pay twice.

Verified against the real PayPal sandbox (shown in the video on sandbox.paypal.com): $200 held → an invoice altered after
signing is blocked by R12 with no change to the balance → the genuine $150 invoice is captured, $50 released, $150 paid out
to the school (payout SUCCESS). The sender's balance ends exactly $150 lower.

429 unit/integration tests and 12 end-to-end tests; the policy gate has 100% line and branch coverage.

## How to run it (functional demo)
Public repo: https://github.com/jesse-kariuki/earmark (MIT). No accounts or keys are needed for the default mode
(in-memory PayPal and recorded AI outputs). Node 20+ and pnpm:

```bash
git clone https://github.com/jesse-kariuki/earmark.git && cd earmark
cp .env.example .env
corepack enable && pnpm install
pnpm db:reset && pnpm dev      # http://localhost:3000
```
The README explains how to switch to the real PayPal sandbox (`PAYPAL_MODE=sandbox`) and to live AI (`AI_MODE=live`).

## Tools (models and AI services) and how they were used
- **Google Gemini (`gemini-3.5-flash`)** through the Vercel AI SDK (`@ai-sdk/google`): the live model used for this
  submission. It compiled the demo sentence into the Intent Contract shown in the video.
- **Anthropic Claude** through `@ai-sdk/anthropic`: the alternative live provider for the same jobs.
- **Vercel AI SDK**: every model output is validated against a Zod schema; the Guardian agent uses tool calling.
  The model's four jobs: compile the sentence into a contract, read untrusted invoices (no tools), choose the Guardian's
  next step, and write the recipient message. None of them can move money.
- **PayPal**: Orders v2 (authorize), Payments v2 (capture with `final_capture`, void), Payouts v1, Webhooks, the
  PayPal JS SDK buttons, the **PayPal Agent Toolkit** (read-only `get_order` / `list_transactions` for the Guardian), and
  the PayPal MCP server during development.
- **Claude Code**: AI coding assistant used to build and test the project.
- **Demo video**: narration generated with edge-tts (Microsoft neural voice), recorded with Playwright, assembled with ffmpeg.

## Demo video
YouTube link: _add after upload_ · length 2:53 · shows the app running in a desktop browser against the PayPal sandbox.
