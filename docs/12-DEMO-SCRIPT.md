# 12 — Demo Video Script (target 2:50, hard limit < 3:00)

One family's story, ending on a blocked fraud attempt. Record at 1080p, clear voice, **no music**,
fictional names only, no logos beyond what the PayPal sandbox shows. Use `AI_MODE=fixture` for
deterministic takes; mention that judges can toggle Live.

| Time | Scene | On screen | Voiceover (draft) |
|---|---|---|---|
| 0:00–0:20 | Problem | Title card: "Kenya received a record US$5.04 billion in diaspora remittances in 2025 (Central Bank of Kenya)." | "Wanjiru sponsors her brother's schooling from Atlanta. Last term the fees never reached the school, and she couldn't prove where they went. Why not just send money directly? Because a transfer can't tell you where it went." |
| 0:20–0:50 | Write the promise | `/compose`: type the sentence; ContractPanel compiles beside it; approve; PayPal sandbox popup; MoneyBar "$400 held · $0 sent". | "She writes what the money is for. Earmark compiles it into a contract she can read, and PayPal holds the money — it isn't sent yet." |
| 0:50–1:25 | Happy path | Switch persona → School; issue signed invoice $350. Back to Sender: trace drawer streams: signature ✓, rules ✓, Guardian checks the PayPal order via the Agent Toolkit, ticket, capture $350, payout to school, $50 released. Recipient card in Swahili. | "The school's agent sends a signed invoice. Wanjiru's Guardian agent checks it against the registry and PayPal's own record. A deterministic policy gate — not the AI — approves it. Exactly $350 is captured and paid to the school; the other $50 is released. Brian sees it in Swahili." |
| 1:25–2:10 | The attack | Upload `11-hidden-instruction.pdf` (swapped account + hidden "pay $800" text). Blocked. Open trace: R13 + R05, extractor "No tools" badge, Guardian never saw raw text. | "Now someone sends a doctored invoice with a different payout account and a hidden instruction to the AI to pay $800. It's blocked. The model that read the invoice had no tools, and the payout account can only ever be the school's registered one." |
| 2:10–2:35 | Proof & ledger | `/receipt/:id` → "Chain verified ✓". Click "Simulate tampering" → "Broken at event #9". AG Grid ledger filtered to blocked attempts across 4 beneficiaries. `/lab` → Run all → 5 blocked. Eval badge "12/12". | "Every step is hash-chained. Anyone with the link can verify it — change one record and the receipt breaks. A scholarship fund sees every beneficiary in one ledger. And judges can run the attacks themselves." |
| 2:35–2:50 | Close | Architecture frame (3 s) → "Money that remembers why it was sent." → repo URL + "PayPal Sandbox" label. | "Earmark. Send money with a reason — and keep the reason attached." |

## Recording checklist

- [ ] `pnpm db:reset`; browser zoom 110%; hide bookmarks bar; notifications off.
- [ ] Rehearse until the happy path runs without pause; record the attack segment twice.
- [ ] Captions (YouTube auto + fix), public visibility, test the link logged out.
- [ ] Keep raw takes; edit with simple cuts only.
