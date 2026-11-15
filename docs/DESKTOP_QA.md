# Desktop verification (v2)

Checked on 15 November 2026 at the desktop pane size, against the final recorded v2 proof served by `next dev`. Desktop only; no phone or tablet sizes were checked.

## Case routes

All eight case routes loaded directly. Navigation was exercised between cases through the case previous/next links (two hops forward and seven back, every destination's visible case ID matched), and through real pointer clicks on journal records, the sidebar desk, Change ledger and Open watches links.

| Case | Direct load | Result shown |
| --- | --- | --- |
| x-ai-training | Passed | TRIGGERED, closed window |
| concern-rejected | Passed | REJECTED |
| baseline-passage-rejected | Passed | CODE_REJECTED |
| cosmetic-date-only | Passed | NOT_TRIGGERED |
| injection-ignored | Passed | TRIGGERED, closed window |
| challenge-upheld | Passed | NO_AGREEMENT with the retained-failure notice |
| challenge-rejected | Passed | VOID |
| zoom-ai-training | Passed | VOID |

## Other screens

- Home: eight journal records and three funded current watches; two confirmed catches in the ledger.
- Open watches: Zoom, X and GitHub each show 100 wei, the affirmative frozen criteria, baseline timestamp, expiry and OPEN state.
- Change ledger: the two confirmed, paid catches.

No wallet request, judgment, challenge or deposit was submitted during this pass.

## Production follow-up

Recorded after the Vercel redeploy in `docs/VERIFICATION.md`.
