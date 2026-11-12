# Earmark demo video: storyboard (~2:30)

Read by the pipeline: `demo/narrate.sh` speaks each **Narration** line, `demo/build.sh` burns it in as captions,
and `demo/record.ts` holds each scene until its narration has finished. Keep one `## Scene N` heading per scene,
with the narration on a single line. Numbers are written as words so text-to-speech reads them naturally.

Story (~2:15 with the default Windows voice): Grace (abroad) earmarks $200 for Brian's Term 1 fees at Lakeview Secondary School. All names are fictional
and everything runs against the PayPal sandbox (or the in-memory mock PayPal).

Title card (3 s): **Earmark — money that keeps its promise**

## Scene 1 · The payoff
- **On screen:** Last term's Earmark for Brian: the money bar shows $350 paid to Lakeview, $50 released, $0 held. Then its Proof Receipt with "Chain verified".
- **Narration:** Last term, Grace held four hundred dollars for Brian's school fees. The school was paid exactly its invoice, three hundred and fifty, and the rest went back to her, but only after the invoice was checked against the reason she sent the money.

## Scene 2 · Write the purpose
- **On screen:** Compose page. The sentence "Pay Brian's Term 1 school fees at Lakeview Secondary School, up to $200, only against a real invoice." is typed, then Compile contract shows the contract: Lakeview Secondary School (verified), school fees, cap $200.00.
- **Narration:** This term she writes the purpose in one sentence. The AI turns it into a contract she can read: Lakeview Secondary School, school fees, never more than two hundred dollars.

## Scene 3 · Hold it in PayPal
- **On screen:** Approve contract, then Hold with PayPal (sandbox popup: buyer logs in and approves; mock mode: one button). Lands on the Earmark page: "$200.00 is held at PayPal, not sent."
- **Narration:** She approves it, and PayPal holds the two hundred dollars. Held, not sent: nothing leaves until a real invoice arrives.

## Scene 4 · An attempt to cheat
- **On screen:** School console for this Earmark. Invoice lines: Tuition $120.00, Activity fee $30.00. Click "Demo: alter it after signing": a $40 late fee is added after the school signed ($190, still under the cap, so only the signature can catch it). Result: blocked by R12_SIGNATURE_VALID, nothing paid.
- **Narration:** Now someone adds a forty dollar late fee to the school's invoice after it was signed. The signature no longer matches, rule R twelve blocks it, and no money moves.

## Scene 5 · Verified, then paid
- **On screen:** Click "Issue signed invoice" for the genuine $150. The rule checklist passes, the Guardian agent confirms the hold and proposes the payment, and the status reads "paid. The money reached the school".
- **Narration:** Then the school sends the genuine invoice for one hundred and fifty dollars. Seventeen fixed rules check it, the Guardian agent confirms the hold in PayPal, and the policy gate, not the AI, approves the payment.

## Scene 6 · Released, with a trace
- **On screen:** The Earmark page: $150 sent to the school, $50 released back, $0 held. Open the trace drawer: who did what, the PayPal Request-Ids, and the Guardian checking the hold through the PayPal Agent Toolkit.
- **Narration:** PayPal captures exactly one hundred and fifty dollars, pays the school's registered account, and releases the other fifty to Grace. The trace shows every step and which agent took it.

## Scene 7 · The family sees it
- **On screen:** The recipient view on Brian's side: "Brian's Term 1 school fees were paid", $150.00 to Lakeview Secondary School. Switch to Kiswahili, then tap "Thibitisha nimeona" (confirm I saw it).
- **Narration:** Back home, Brian's family gets a short message in English or Kiswahili saying the fees were paid, and taps once to confirm they saw it.

## Scene 8 · Try to break it
- **On screen:** The Attack Lab. Click "Run all": seven real attacks run through the same pipeline (swapped payout account, inflated total, reused invoice, expired Earmark, hidden AI instructions, forged signature, agent overpay). Each card turns to "Blocked by R…", and the header reads "7/7 attacks blocked · no money moved".
- **Narration:** Anyone can try to break it. The Attack Lab runs seven real attacks through the same pipeline: a swapped payout account, an inflated total, a reused invoice, hidden instructions aimed at the AI. Every one is blocked, and each card names the rule that stopped it.

## Scene 9 · Proof anyone can check
- **On screen:** The Proof Receipt: "Chain verified". Click "Simulate tampering (demo)": the receipt now reads "Broken at event #N".
- **Narration:** Finally, the proof receipt. Your browser re-checks every hash in the log, so changing a single event breaks it. Earmark: money that keeps its promise.

End card (4 s): team name and repo link (`DEMO_TEAM`, `DEMO_REPO_URL`).
