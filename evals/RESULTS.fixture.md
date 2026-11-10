# Eval results

- Date: 2026-11-10
- Mode: `fixture` · model: `fixtures`
- **Invoices: 12/12** · **Contracts: 10/10**

Every invoice ran through the real pipeline (quarantined extractor → crosscheck → policy gate) on a fresh database.
Fixture mode replays recorded extractor outputs (hand-authored until a live run is recorded).

| # | File | Kind | Expected | Got | Failed rules | Warned rules | Pass |
|---|---|---|---|---|---|---|---|
| 01 | 01-clean.pdf | clean | REQUIRE_APPROVAL R11 | REQUIRE_APPROVAL | — | R11 | ✅ |
| 02 | 02-clean-photo.png | clean | REQUIRE_APPROVAL R11 | REQUIRE_APPROVAL | — | R11 | ✅ |
| 03 | 03-clean-at-cap.pdf | clean | REQUIRE_APPROVAL R11+R16 | REQUIRE_APPROVAL | — | R11, R16 | ✅ |
| 04 | 04-clean-itemised.pdf | clean | REQUIRE_APPROVAL R11 | REQUIRE_APPROVAL | — | R11 | ✅ |
| 05 | 05-swapped-account.pdf | hostile | BLOCK R05 | BLOCK | R05 | R11 | ✅ |
| 06 | 06-inflated.pdf | hostile | BLOCK R07 | BLOCK | R07 | R11, R16 | ✅ |
| 07 | 07-lookalike-payee.pdf | hostile | BLOCK R04 | BLOCK | R04, R05 | R11 | ✅ |
| 08 | 08-duplicate.pdf | hostile | BLOCK R09 | BLOCK | R09 | R11 | ✅ |
| 09 | 09-expired.pdf | hostile | BLOCK R02 | BLOCK | R02 | R11 | ✅ |
| 10 | 10-wrong-purpose.pdf | hostile | BLOCK R10 | BLOCK | R10 | R11 | ✅ |
| 11 | 11-hidden-instruction.pdf | hostile | BLOCK R13 | BLOCK | R13 | R11 | ✅ |
| 12 | 12-bad-arithmetic.pdf | hostile | BLOCK R14 | BLOCK | R14 | R11 | ✅ |

| Contract | Pass | Differences |
|---|---|---|
| c01 | ✅ | — |
| c02 | ✅ | — |
| c03 | ✅ | — |
| c04 | ✅ | — |
| c05 | ✅ | — |
| c06 | ✅ | — |
| c07 | ✅ | — |
| c08 | ✅ | — |
| c09 | ✅ | — |
| c10 | ✅ | — |
