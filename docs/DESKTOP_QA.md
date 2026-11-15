# Desktop verification

Checked on 15 November 2026 in Chrome at **1440 × 960**. Desktop only. This pass used the final recorded proof at `http://localhost:3121`; production checks are recorded below after deployment.

## Case routes

All twelve routes loaded directly. The case-navigation links were clicked through all eleven transitions from the last record back to the first. Every destination's visible case ID was checked. No horizontal overflow was observed.

| Case | Direct load | Case navigation |
| --- | --- | --- |
| x-ai-training | Passed | Passed |
| concern-rejected | Passed | Passed |
| adobe-content-access | Passed | Passed |
| baseline-passage-rejected | Passed | Passed |
| cosmetic-date-only-timing-recovery | Passed | Passed |
| injection-ignored | Passed | Passed |
| challenge-upheld-timing-recovery | Passed | Passed |
| challenge-rejected-timing-recovery | Passed | Passed |
| zoom-ai-training | Passed | Passed |
| cosmetic-date-only | Passed | Passed |
| challenge-upheld | Passed | Passed |
| challenge-rejected | Passed | Passed |

The cosmetic false-positive warning, recovery labels, per-criterion quotes, closed challenge windows, verified payouts, original VOID paths and retained finalized-error receipt were visible. One rapid batched navigation click did not navigate on its first attempt; after inspecting the unchanged page, a fresh click succeeded. All eleven transitions were subsequently verified.

## Other screens

- Home: four finalized paid records, the cosmetic false-positive label, twelve journal records and three funded current watches.
- Docket: Zoom, X and GitHub each show 100 wei, the frozen criteria, baseline timestamps and expiry dates. Adobe's unfunded VOID attempt shows its zero deposit and finalized receipt.
- Transactions: 146 recorded receipts; credited native transfers retain their actual success classification, and the mistaken cleanup remains a finalized error.
- Watch flow: restored an old compiled watch and expired ticket; funding was disabled. Opened a fresh form and checked its labeled inputs without compiling another watch.
- Claim flow: labeled snapshot and passage inputs; preflight and write controls disabled before a frozen watch is loaded.
- Challenge flow: claim/window loading and evidence preparation controls disabled without a loaded claim.
- Credits: recovery inputs and disabled controls before a record is inspected.
- Ledger and hunter screens: recorded results separated from optional live reads; hunter profile showed three catches and three won challenges for the scripted account.

No additional wallet request, judgment, challenge or deposit was submitted during this pass. Fresh unsubmitted form text is not a saved transaction and was not treated as reload-safe proof.

The browser emitted extension-related diagnostics: Dark Reader injected hydration attributes, and installed wallet extensions competed for `window.ethereum`. These were retained as environment observations. No app exception was observed in this pass.

The temporary viewport override was reset after the checks. Raw observations and screenshots are kept in the ignored local evidence cache.

## Production follow-up

Pending the final verified source deployment.
