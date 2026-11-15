# Verification record: Fine Print v2

The full read-only link audit finished at 2026-11-15T14:36:34Z on StudioNet 61999. **All 6 contract links and 101 transaction links passed** the Explorer API and canonical page checks. Source fingerprints, peer bindings, finalized receipts, native credits and the 367 / 1,000 wei deposit record were checked.

The full verifier initially exited 1 with two retained-failure handling errors. With owner approval, the verifier now checks the recorded finalized MAJORITY_DISAGREE error instead of demanding successful consensus, and checks that its claim remains READY instead of demanding a synthetic on-chain NO_AGREEMENT status. The proof and deployed contracts were unchanged. The original two errors and timestamp remain in [the JSON report](VERIFICATION.json).

The affected failed-receipt recheck passed. The corrected **complete finalized-state check passed: 49 RPC requests, 43 distinct state reads, zero errors**. See [state report](VERIFICATION.state.json). The final evidence result combines that complete state recheck with the completed link audit; a second full Explorer audit was not run. Earlier malformed local request-cache failures were preserved locally before repair.

**Cases 6, 7 and 8 did not produce their intended demonstrations.** Case 6 retained a validator disagreement with no judgment, challenge or payout; cases 7 and 8 finalized VOID due to unavailable archive evidence. They are disclosed in [RESULTS.md](RESULTS.md). Verification confirms actual outcomes, not the planned successful demonstrations.

## Release checks

- TypeScript: passed.
- ESLint: passed.
- App tests: 25 passed.
- Direct contract tests: 90 passed.
- Production build: passed with FP_NEXT_DIST_DIR=.next-release-check; tsconfig.json and next-env.d.ts restored.
- Desktop: 1440 x 960; all 8 case routes loaded directly, all 7 previous and 7 next transitions passed, 3 OPEN watches at 100 wei each, 2 confirmed catches. NO_AGREEMENT limitation notice visible. No horizontal overflow on the 8 case routes.
- The home journal uses a generic “Observed false positive” badge for any recorded limitation, including the retained no-agreement case; its case page explains the actual validator disagreement. The cosmetic case itself is NOT_TRIGGERED.
- Contract source bytes and evidence-file hashes unchanged during this release. Git attributes preserve the deployed CRLF bytes of the two v2 source files rather than normalizing their hashes.

No on-chain transaction was submitted during this release pass. The owner submits the Portal form personally.

## Production

Checked 2026-11-15 14:48:39 UTC. Deployment: https://fine-print-5c34ui99i-wattxs-projects.vercel.app (READY, production); public alias: https://fine-print-ten.vercel.app/. Release source commit: b0b6d25aa5b92d8f8945327c591a6d807734c62c. Public checks confirmed 8 journal records, cosmetic-date-only NOT_TRIGGERED, challenge-upheld NO_AGREEMENT with its limitation notice, 3 OPEN watches funded at 100 wei each, and all six displayed Explorer contract links matching deploy/proof.json. Desktop viewport: 1440 x 960; reset afterward. The remote Vercel production build passed.
