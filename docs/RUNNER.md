# Resumable StudioNet cases

The owner approved a dedicated test account and one transfer of up to 1,000 wei. The account address and network are public in `deploy/test-account.json`. Its private key is stored only in the gitignored `.env` as `FINE_PRINT_TEST_PRIVATE_KEY`. Never copy that file into a deployment, repository, issue, or terminal output. Initialization preserves an existing key and never prints it.

```sh
node --import tsx scripts/init-test-account.ts
node --import tsx scripts/run-case.ts plan
node --import tsx scripts/run-case.ts all
```

`plan` reads the archived records and freezes the case IDs, source inputs, account and deposit cap in `deploy/runner-plan.json`. It does not run a judgment. `all` runs the cases in the owner's requested order, then funds the current X and Adobe watches. A specific plan ID can be supplied instead of `all`. `cleanup` closes the original expired compilations, prepared claims and unused funded watches without repeating their judgments. Refund credits for the original owner are reserved for that owner; the dedicated account cannot withdraw them.

The five cases are baseline passage rejection, cosmetic date-only claim, injected challenge argument, prior-substance Adobe challenge, and a wrong-document challenge on a genuine Zoom change. Hypotheses are never copied into proof as verdicts. A preparation that returns CODE_REJECTED or VOID ends that case without a bond or model judgment. An actual NOT_TRIGGERED or UNCLEAR judgment is recorded even if a challenge was planned. An injection succeeds as an attack only if it changes the actual ruling; the runner does not label an expected result as observed.

Expired historical watches cannot accept claims. The code rejection therefore shares the new 10-wei Zoom setup escrow with the following cosmetic case. The rejection transaction itself performs only archive fetching and deterministic passage checks. It invokes no LLM judgment and accepts no bond. The cosmetic claim follows after that rejection finalizes. This makes the two claim outcomes independently visible while reusing the funded watch.

The other new historical escrows are 10 wei each; hunter and challenger bonds remain the deployed contracts' fixed 1 wei. Current watches use 100 wei. Before every positive deposit, the runner reads the contract's cumulative accounting, checks the local transaction ledger and refuses to exceed the owner's 1,110-wei project cap. Funding the test account is a separate native transfer, not a Bounties deposit. Withdrawals do not reset the cumulative cap.

The current Adobe Terms watch finalized VOID because immutable baseline evidence was unavailable. No funds were accepted and that watch was not retried. A distinct GitHub Terms watch, concerning private repository content at rest and AI training without owner consent, substitutes for it. The plan records that amendment, and the original VOID receipt remains in `liveWatchAttempts`.

Each action has a fixed journal key. The signer saves the exact signed bytes under `.source-cache/runner/wire/` before broadcasting. The returned hash is written into `deploy/proof.json` before finality polling begins. If the process exits between broadcast and journal update, it reuses those exact signed bytes and nonce instead of signing a replacement transaction. Finalized actions with verified readback are reused. Completed case IDs are recorded separately. A finalized execution error is preserved and stops that action rather than silently retrying it.

To resume after an interruption, run the same command. A process lock prevents simultaneous runners. A dead lock is detected by its process ID. Logs contain addresses, method names, receipt hashes, statuses and budget waits; they do not contain the private key or signed bytes.

The SDK provider path signs locally with the dedicated account. This avoids the SDK 1.1.8 local-account path's EVM-receipt wait on StudioNet. Contract source and deployed addresses remain unchanged. Every request uses a browser user agent and a persisted rate budget with at least 2.5 seconds between requests. The runner reserves capacity before a new case to keep rate-limit waits outside ticket windows. Receipt and callback polling occurs every 10 seconds.

A triggered claim is challenged if its plan includes a challenge. After the window closes with no upheld challenge, the runner seals the window, reserves settlement, pulls the native credit, finds the linked child transaction, verifies the exact recipient and amount, waits for native finality and submits `verify_claim`. A bounty is marked paid only after its finalized credit readback. Challenge awards and refundable hunter bonds use the same receipt verification process.

Upheld challenges also have their expired intake window sealed, retaining the VOID claim and the challenger award. `close-windows` can finish that closure independently. An original timeout cleanup mistakenly called the nonexistent `void_expired` method and finalized with a zero-value error. That receipt remains labeled as a retained failure; the separate corrected action used `timeout_claim`. No judgment or deposit was repeated. The interface audit now checks runner method names against the frozen deployed source.

The final `npm run verify:proof` is read only. Run it after the writer stops; it shares the persisted request budget with the runner. It checks every cited canonical Explorer contract and transaction link through the API, deployed source fingerprints, final receipts, case identities, native credits, ledger records, current watch escrows and the shared deposit total. Planned outcomes may differ from actual outcomes; missing or inconsistent evidence still fails the gate.
