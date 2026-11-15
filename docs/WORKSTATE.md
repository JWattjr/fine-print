# Work state (v2)

The v2 set supersedes v1. Receipts and results for v1 live in `deploy/v1/`. The scripted runner (`scripts/run-case.ts`) is resumable and overlaps challenge windows: settlement runs in a final `settle` pass. Cumulative incoming Bounties deposits are recorded in `deploy/proof.json` against the owner's 1,000-wei cap. The dedicated runner account is funded from the earlier 1,000-wei owner transfer; no new transfer was needed for v2.

Retained, not retried: the challenge-upheld judgment (validator disagreement). Zoom 2023 judgments finalized VOID. Nothing was rerun to force an expected verdict.
