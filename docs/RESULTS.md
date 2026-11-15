# Actual execution results: v2 contract set

Public app: https://fine-print-ten.vercel.app/

Public repository: https://github.com/JWattjr/fine-print

## What v2 fixes

> **v1 — superseded (cosmetic false positive).** The first deployed contract set let the Watches compiler emit negation and absence criteria ("may NOT be used", "the policy contains no provision addressing ..."). Claims judges one new passage, so a date-only passage satisfied the absence criterion and the cosmetic case finalized TRIGGERED and paid. v1 is not cited as evidence of correct behavior. Its receipts are kept unchanged in [`deploy/v1/proof.json`](../deploy/v1/proof.json) and [`deploy/v1/RESULTS.md`](../deploy/v1/RESULTS.md).

v2 changes: the compile prompt requires affirmative, single-passage criteria; a code guard in Watches drops any criterion containing "no provision", "does not", "not ", "absent", "silent" or "fails to" (if all are dropped the watch is REJECTED, no retry); Claims returns TRIGGERED only when a TRIGGERED criterion has a quote longer than 40 characters taken from the claimed passage. All five contracts were redeployed and configured as a fresh set.

## Cases (each run once, no retries)

| # | Case | Planned | Actual finalized result | Evidence |
| --- | --- | --- | --- | --- |
| 1 | x-ai-training | TRIGGERED, bounty paid | TRIGGERED · 10 wei paid, native credit verified | [Finalized receipt](https://explorer-studio.genlayer.com/tx/0x56ad8f3673c0dafdcec1d6d75a6b25fd2dc3d7f794ae6708fffed86728b23643) |
| 2 | concern-rejected | REJECTED | REJECTED | [Finalized receipt](https://explorer-studio.genlayer.com/tx/0x047bb4913cdb0b13c100c46fb0938cc5ee5efc83cccebdd3ef5ed5b434ae11f7) |
| 3 | baseline-passage-rejected | CODE_REJECTED | CODE_REJECTED | [Finalized receipt](https://explorer-studio.genlayer.com/tx/0xa6a07f946450d3fae594f7c96b9a50984724d960701fe366351d4603fd200482) |
| 4 | cosmetic-date-only | NOT_TRIGGERED, bond forfeited | NOT_TRIGGERED · claim bond forfeited | [Finalized receipt](https://explorer-studio.genlayer.com/tx/0x92118106af0fad1b65d5ce47421b0eb7af6840c92833d65113c67a183a7da467) |
| 5 | injection-ignored | injection ignored | TRIGGERED · challenge REJECTED · 10 wei paid, native credit verified | [Finalized receipt](https://explorer-studio.genlayer.com/tx/0x7e8d4c1b3aef5e8bd19ec51354bc95381bc5b0bc5c94aecf62d9b1c75831ffad) |
| 6 | challenge-upheld | ALREADY_EXISTED UPHELD | RETAINED FAILURE: judge_claim finalized FINISHED_WITH_ERROR (MAJORITY_DISAGREE); validators did not agree. Not retried; no verdict recorded. | [Finalized receipt](https://explorer-studio.genlayer.com/tx/0x0e8544e160a0fbd448bc8074898e1dbd83a08b346efc2d2013e8eaaf240414de) |
| 7 | challenge-rejected | challenge REJECTED, hunter paid | VOID · "Archive evidence unavailable; refund required." | [Finalized receipt](https://explorer-studio.genlayer.com/tx/0x780b717783543b8b7e3d8d156744b34f63f20ce17fc096c7cf65eabe0fd43acb) |
| 8 | zoom-ai-training | TRIGGERED | VOID · "Archive evidence unavailable; refund required." | [Finalized receipt](https://explorer-studio.genlayer.com/tx/0x974928d73ef36ca8fbc1e6d5b145f267cb79cdfb8ae336d508146f7cb86c922e) |

**The cosmetic case passes after the fix.** The date-only passage "Effective Date: August 11, 2023" was NOT_TRIGGERED on the single compiled criterion and the claim bond was forfeited.

**Three planned demonstrations did not land.** Case 6 (ALREADY_EXISTED to UPHELD) ended in a validator disagreement on `judge_claim`, retained as a finalized error and not retried. Cases 7 and 8 both finalized VOID because the validators could not fetch the Zoom 2023 archive at judgment time (v1's first Zoom attempts ended the same way); the archive itself returned 200 from outside the chain. No judgment was rerun to force an expected outcome, so this run has no UPHELD ruling and no TRIGGERED Zoom 2023 payout.

### Compiled criteria (affirmative, none negated)

- **x-ai-training**: "The passage permits the company to use information collected about users to train machine learning models." / "The passage permits the company to use information collected about users to train artificial intelligence models." / "The passage permits the company to use publicly available information to train machine learning or artificial intelligence models."
- **concern-rejected**: none (rejected)
- **baseline-passage-rejected**: "The passage permits Zoom to use service-generated usage or telemetry data to train or tune machine learning or artificial intelligence models."
- **cosmetic-date-only**: "The passage permits Zoom to use service-generated usage or telemetry data to train or tune machine learning or artificial intelligence models."
- **injection-ignored**: "The passage permits using information collected about users to train machine learning or artificial intelligence models." / "The passage permits using publicly available information to train machine learning or artificial intelligence models."
- **challenge-upheld**: "The passage grants Adobe a worldwide license to reproduce user-uploaded cloud content." / "The passage grants Adobe a royalty-free license to use user-uploaded cloud content to operate its services."
- **challenge-rejected**: "The passage permits service-generated usage or telemetry data to be used for machine learning or artificial intelligence model training or tuning."
- **zoom-ai-training**: "The passage permits service-generated usage or telemetry data to be used to train or tune machine learning or artificial intelligence models."

## Current funded watches

| Watch | Bounty | Expiry (UTC) | Latest available baseline | Evidence |
| --- | --- | --- | --- | --- |
| Zoom · live_zoom | 100 wei | 2026-12-15T11:25:32.000Z | 20240718135835 | [Funding receipt](https://explorer-studio.genlayer.com/tx/0xc8664459860d463e4ba3c16624e999848d4cfc1b74279efbe58debeb52700005) |
| X · live_x | 100 wei | 2026-12-15T11:52:14.000Z | 20240517144758 | [Funding receipt](https://explorer-studio.genlayer.com/tx/0x2662f41a64bbfe40d20c951358d9593410fffcdb3c388cfd7c62d674cdab06b5) |
| GitHub · live_github | 100 wei | 2026-12-15T11:59:07.000Z | 20261115040436 | [Funding receipt](https://explorer-studio.genlayer.com/tx/0x8e967c7cd4da823c190271fde79f8fc33abf8f5ede30edf4020387b3fbbf0e71) |

Current watches use their creation time as the as-of time. The latest archived capture can be older than the current policy; its timestamp is shown explicitly.

## Deployed contracts: StudioNet 61999 (v2)

| Contract | GenLayer Explorer Contract |
| --- | --- |
| ArchiveProbe | [0x3af4ed87c46bcb30f296ab190da90f157b205694](https://explorer-studio.genlayer.com/address/0x3af4ed87c46bcb30f296ab190da90f157b205694) |
| Watches | [0xacd153a9ce2a2a762c0a719fd34ffff468d87baa](https://explorer-studio.genlayer.com/address/0xacd153a9ce2a2a762c0a719fd34ffff468d87baa) |
| Claims | [0x608052285ce346ecfe5eafb8d94a3c0f4c3cb07a](https://explorer-studio.genlayer.com/address/0x608052285ce346ecfe5eafb8d94a3c0f4c3cb07a) |
| Challenges | [0xb7fcf75f7462198c0f3aa4dbcb7f9067c7781838](https://explorer-studio.genlayer.com/address/0xb7fcf75f7462198c0f3aa4dbcb7f9067c7781838) |
| Bounties | [0xc8fd789dccf626ccc93318987a59c160d79738d4](https://explorer-studio.genlayer.com/address/0xc8fd789dccf626ccc93318987a59c160d79738d4) |
| ChangeLedger | [0x969c8e8094df9174e75f60b7db76c3aa23954fb3](https://explorer-studio.genlayer.com/address/0x969c8e8094df9174e75f60b7db76c3aa23954fb3) |

ArchiveProbe is the original probe contract; it was not redeployed.

## Value and execution

Cumulative contract deposits: **367 wei / 1,000 wei approved**. Refunds and payouts do not reset the cap. The dedicated runner account (`0xEA73D12c4616fcEB859C4AB585113c1eAb54903B`) was funded earlier by the owner's one 1,000-wei transfer; no further transfer was needed for v2. It acted as sponsor, hunter and challenger, so these runs show the validator and deterministic contract paths, not independent market participation.

## Retained finalized error

| Call | Execution | Disposition | Evidence |
| --- | --- | --- | --- |
| judge_claim (case 6) | FINISHED_WITH_ERROR · MAJORITY_DISAGREE | Retained, not retried. The 10-wei watch escrow and 1-wei hunter bond for this case stay locked until the watch expires. | [Finalized error](https://explorer-studio.genlayer.com/tx/0x0e8544e160a0fbd448bc8074898e1dbd83a08b346efc2d2013e8eaaf240414de) |
