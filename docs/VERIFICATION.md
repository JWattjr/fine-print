# Verification record

Fine Print's execution receipts include unexpected outcomes. The cosmetic date-only claim exposed a compiler false positive; the project is not described as submission ready.

## Completed code checks

- `npm test`: **25 passed**. Includes archive checks, transaction finality, native credits, runner method/interface conformance, saved-hash recovery, deposit-cap enforcement, expired-ticket refusal and independent-process journal locking.
- `npm run typecheck`: passed.
- `npm run lint`: passed.
- Production webpack build: passed using `.next-build-final3` outside the Windows sandbox. Two preceding sandbox attempts failed with generated-directory EPERM errors; those attempts were not passes.
- Direct contract tests: **79 passed** during contract authoring. All six deployed source files remain unchanged.
- GenVM lint: all six contract files passed during contract authoring. The final independent read-only audit checks the deployed source fingerprints again.
- Desktop: **1440 × 960**, all twelve recorded case pages loaded directly and all eleven case-navigation transitions verified. Other screens and environment observations are detailed in [DESKTOP_QA.md](DESKTOP_QA.md).

The tutorial contains 886 words. Portal fields meet their character limits and contain six separate entries of type `GenLayer Explorer Contract`. No Portal form was submitted.

## Full read-only proof audit

The complete `npm run verify:proof` audit finished at **2026-11-15 07:28:59 UTC**. All **6 contract links and 148 transaction links** passed Explorer API and canonical-page checks. The only initial state-check errors were three refund comparisons against the cleared remaining balance. The deployed contract moves that balance into `refunded_wei`; the verifier was corrected accordingly.

The corrected **complete state recheck passed at 07:34:03 UTC: 72 RPC requests, 66 distinct state reads, zero errors**. The final [JSON report](VERIFICATION.json) preserves the initial errors and correction history, plus the exact proof SHA-256. Its [state recheck](VERIFICATION.state.json) is also published. No partial attempt is reported as a completed audit.

**The readiness gate remains failed.** The original Zoom funding timeout is retained as a blocker, and the cosmetic date-only compiler false positive remains unresolved. Evidence consistency passing does not turn those outcomes into successful cases.

The verifier checks StudioNet chain 61999, all six contract API records and canonical pages, every cited transaction API record and canonical page, finalized RPC receipts, deployed source fingerprints, peer bindings, archive probes, actual case outcomes, quoted excerpts, challenge closure, native credits, current watch escrows and cumulative incoming deposits.

The real zero-value cleanup error is retained. Verification must confirm its finalized error and zero value; it is not treated as a successful transaction. Nine native payout receipts were reconciled from raw StudioNet transaction types after the SDK erased numeric type 0. Their hashes, parent links, recipients and amounts were unchanged, and no payment was resent.

## Production deployment

Pending the final audit report and committed source deployment.
