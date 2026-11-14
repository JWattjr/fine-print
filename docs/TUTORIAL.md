# A policy watch, from archive to native credit

Fine Print separates three judgments from the accounting that follows them. GenLayer validators compile a concern, judge a proposed passage, and resolve an archive challenge. Python code sets amounts, verifies evidence, enforces deadlines, and reserves payments. The model cannot choose a bounty or change a bond.

The five application contracts live under `contracts/`: `watches.py`, `claims.py`, `challenges.py`, `bounties.py`, and `change_ledger.py`. Each pins the same concrete GenVM runner and rejects deployment outside StudioNet 61999. The separate `archive_probe.py` tests validator access to the selected captures. Consult `deploy/proof.json` for completed transactions. `deploy/case-plan.json` contains hypotheses and offline preflight results, not completed live evidence.

## Freeze a concern and its baseline

Start the app with `npm run dev` and open `/watches/new`. Enter an official policy URL, an observable concern, an exact bounty in wei, expiry, and challenge window. The public form creates a production watch. Historical replay calls pass an explicit fourteen-digit `historical_asof`; the contract stores `historical_replay` and the interface labels it.

`Watches.compile_watch` validates bounds, then validators compile one to three criteria or reject the concern. An accepted concern needs the latest successful exact CDX capture at or before its as-of time. Code fetches that immutable `id_` snapshot, handles gzip bytes, removes nonvisible HTML, normalizes text, and hashes it. Validators independently check the capture, digest, and fidelity of proposed criteria. Inaccessible evidence yields VOID rather than an invented policy verdict.

The record initially waits in `PENDING_FINALITY`. Its self callback, emitted with `on="finalized"`, promotes it to COMPILED, REJECTED, or VOID. An accepted receipt alone is insufficient. Review frozen criteria and the baseline before funding. Unfunded compilations can be voided after their one-hour funding deadline.

## Fund through a bounded ticket

`Bounties.prepare_deposit` sends zero value and binds a ticket to a wallet, purpose, record, exact amount, and expiry. Its finalized callback makes it READY. The payable `deposit` must attach exactly that value. Correct deposits become watch escrow or bonds; mismatches become refundable credits. Unused tickets can be released after expiry.

Every received deposit counts against the project cap. StudioNet can credit native value even when execution fails. `recover_failed_deposit` verifies a finalized failed receipt, sender, destination, credited value, and available unaccounted balance before allocating a refund once per transaction. `resume_deposit` handles delayed successful allocation callbacks. Neither assumes an unknown outcome is safe to repeat.

## Submit and judge a passage

On `/claims/new`, load a finalized open watch and paste a later Wayback URL plus a passage of at most 1,200 characters. The browser preflight checks archive evidence and the frozen baseline digest. It is a preview; contracts repeat all checks independently.

`Claims.prepare_claim` requires the same original URL, a later capture, passage presence in the new normalized text, and absence from the baseline. Matching collapses whitespace and preserves case. Failed checks record CODE_REJECTED without a model call or bond. A valid preparation becomes READY after finality. The hunter prepares a bond ticket, deposits the exact bond, and calls `judge_claim` with zero value.

Judgment returns a verdict and quote for each criterion. Validators agree on verdicts and verify leader quotes against their own evidence; they need not choose identical quotes. TRIGGERED opens challenges. NOT_TRIGGERED forfeits the bond to the watch. UNCLEAR or unavailable evidence releases a refund path. Unresolved preparation or judgment can time out to VOID. `reconcile_bond` finishes allocations when callbacks are lost or a bond finalizes late.

## Challenge the substance or document

Open `/challenges/<claim-id>`. ALREADY_EXISTED requires a verified baseline passage; validators decide whether it already grants the substance described by the triggered criterion. WRONG_DOCUMENT compares bounded extracts for identity, error pages, and locale. Arguments remain untrusted context, including the planned injection test.

Each challenge has preparation, bond funding, and judgment. An upheld challenge voids the claim and awards the hunter bond to the challenger. A rejected challenge awards its bond to the hunter. A void challenge returns its bond. Unresolved challenges have timeout controls. After intake closes and pending challenges reach zero, `seal_claim` finalizes closure. A missing closure callback can be rescheduled after thirty minutes through `resume_seal`.

## Pull a payment and prove receipt

Settlement requires a finalized valid claim and sealed challenge summary with no upheld challenge. `Bounties.settle` reserves bounty and hunter-bond credits. Reservation is not payment. On `/credits`, read a wallet's finalized credits, claim an AVAILABLE credit, and track the native child linked to that pull attempt.

`verify_claim` checks finalized parent calldata, credit ID, attempt, sender, contract, linked child, recipient, exact amount, and `value_credited`. A proved failed child restores credit; an unknown outcome blocks another pull. Verification finishes through a finality callback. Only finalized verified bounty credit permits the immutable ChangeLedger append. Unclaimed bounty credits expire after seven days into a sponsor refund path. Expired watches without valid unresolved catches can also refund.

## Inspect the result

Home, case pages, ledger, and hunter profiles separate recorded proof from explicit live finalized reads. The action journal saves hashes before polling every ten seconds. Development also mirrors curated records to disk; production disables internal source and journal endpoints. Raw validator configuration and keys are never published.

Run `npm test`, `npm run typecheck`, `npm run lint`, and `python -m pytest tests/direct -q`. Lint each contract with `genvm-lint` and run a production build. The read-only `npm run verify:proof` checks recorded on-chain evidence and canonical Explorer links. Local checks support review; actual finalized live transactions establish demo outcomes.
