# 90-second demo script

This script is for a release with a completed proof journal. If any case is still pending, show the pending state in the Transactions page and identify the case as pending. Do not narrate an expected result as a finalized result.

**0:00–0:12 — The desk.** Open the home page without a wallet. Explain that a policy change only appears in the ledger after finality, the challenge window and payout readback. Point out the StudioNet network label.

**0:12–0:28 — A catch.** Open the X historical AI-training case. Show the frozen concern and compare the archived baseline with the later passage. Follow both Wayback `id_` links and read the criterion verdict and validator quote. This catch has a verified 100-wei native payout.

**0:28–0:42 — Settlement.** Show the closed challenge window, payout amount, recipient and native credit readback. Open the case transaction and direct contract address in the StudioNet Explorer.

**0:42–0:54 — Catch the false positive.** Open `cosmetic-date-only-timing-recovery`. Its permission criteria were NOT_TRIGGERED, but the compiler also produced an absence criterion, which triggered on the date-only passage. Show the actual aggregate TRIGGERED result. Say clearly: this is an observed compiler failure. The deployed contracts remain unchanged.

**0:54–1:06 — Evidence before opinions.** Show the baseline passage: CODE_REJECTED, no model judgment or claim bond. Flash the challenge receipts: Adobe's restated license was UPHELD and the claim became VOID; the genuine Zoom change's challenge was REJECTED. The injected challenger argument was also REJECTED.

**1:06–1:18 — Current docket.** Open the live watch page. Choose one current watch and show its baseline timestamp, frozen criteria, funded bounty and expiry. Clearly distinguish production watches from historical replays.

**1:18–1:30 — Receipts and limits.** Open the transaction log and show finalized receipts. Read the actual deposit total from the proof and explain the owner's stricter 1,110-wei cap. The dedicated-account funding transfer is separate from escrow deposits. Finish with the actual proof-verifier result and the separate Explorer contract evidence entries. Do not call the app submission ready while the compiler false positive remains unresolved.

<!-- BEGIN RECORDED RUN NOTES -->

## Recorded run notes

- baseline passage: **CODE_REJECTED**. [Receipt](https://explorer-studio.genlayer.com/tx/0xfc56d44d1ff527f1849498fabd3dddb292fa40664c1f809a14da5a00596c8172).
- date-only: **TRIGGERED** · 10 wei paid. [Receipt](https://explorer-studio.genlayer.com/tx/0x06d23da7abc6fa10979fc5610c5373247575d727889d08f055fbd8f0b2ae2a8a).
- injection: **TRIGGERED** · challenge **REJECTED** · 10 wei paid. [Receipt](https://explorer-studio.genlayer.com/tx/0x726dd642d4fcceba512b5ec3dd87b84be2292638876bb4bf5e001e9a2b61247e).
- prior substance: **VOID** · challenge **UPHELD**. [Receipt](https://explorer-studio.genlayer.com/tx/0xa1f51ff6be8968e04fe955adf6e30e1cbb934db441bd3c80f71ff486a2605a69).
- genuine change: **TRIGGERED** · challenge **REJECTED** · 10 wei paid. [Receipt](https://explorer-studio.genlayer.com/tx/0x9ef569b90b193f2f067432e031026d1c03691eb6660c88f2b67bae6b47bda356).

The original timing failures remain in [the full receipts](RESULTS.md). Recovery IDs are labeled “re-run after a timing failure.” There are 3 funded current watches and 848 wei of cumulative contract deposits. The compiler false positive prevents a submission-ready claim.

<!-- END RECORDED RUN NOTES -->
