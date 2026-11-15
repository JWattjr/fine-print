# Actual execution results

Public app: https://fine-print-ten.vercel.app/

Public repository: https://github.com/JWattjr/fine-print

The cosmetic case produced an observed false positive. Its two permission criteria were NOT_TRIGGERED, while an extra compiler-generated absence criterion was TRIGGERED by the date-only passage. These deployed contracts have not been edited or redeployed. This limitation prevents a submission-ready claim.

## Cases

| Case | Actual finalized result | Evidence |
| --- | --- | --- |
| x-ai-training | TRIGGERED · 100 wei paid | [Finalized receipt](https://explorer-studio.genlayer.com/tx/0x253fee4fc990efd38d2290203ace981ebadc956d06db36de55c06a9d3a8c275e) |
| concern-rejected | REJECTED | [Finalized receipt](https://explorer-studio.genlayer.com/tx/0x1ede355bae8d9e320279f6e9e087b6d894564425d7beee09b6a3a896435c864b) |
| adobe-content-access | VOID | [Finalized receipt](https://explorer-studio.genlayer.com/tx/0xbb6b3990e9f27624f31c68280fc6362784c0cc16c34921b40ab0b1d8d60817f8) |
| baseline-passage-rejected | CODE_REJECTED | [Finalized receipt](https://explorer-studio.genlayer.com/tx/0xfc56d44d1ff527f1849498fabd3dddb292fa40664c1f809a14da5a00596c8172) |
| cosmetic-date-only-timing-recovery · re-run after a timing failure | TRIGGERED · 10 wei paid | [Finalized receipt](https://explorer-studio.genlayer.com/tx/0x06d23da7abc6fa10979fc5610c5373247575d727889d08f055fbd8f0b2ae2a8a) |
| injection-ignored | TRIGGERED · challenge REJECTED · 10 wei paid | [Finalized receipt](https://explorer-studio.genlayer.com/tx/0x726dd642d4fcceba512b5ec3dd87b84be2292638876bb4bf5e001e9a2b61247e) |
| challenge-upheld-timing-recovery · re-run after a timing failure | VOID · challenge UPHELD | [Finalized receipt](https://explorer-studio.genlayer.com/tx/0xa1f51ff6be8968e04fe955adf6e30e1cbb934db441bd3c80f71ff486a2605a69) |
| challenge-rejected-timing-recovery · re-run after a timing failure | TRIGGERED · challenge REJECTED · 10 wei paid | [Finalized receipt](https://explorer-studio.genlayer.com/tx/0x9ef569b90b193f2f067432e031026d1c03691eb6660c88f2b67bae6b47bda356) |
| zoom-ai-training | VOID | [Finalized receipt](https://explorer-studio.genlayer.com/tx/0x4730a747fe3e378e9725eee251b607b80aeb4246fd017d0324f4cb6bf7cabeb0) |
| cosmetic-date-only | VOID | [Finalized receipt](https://explorer-studio.genlayer.com/tx/0xc4662e470cfe3ef25c332e2340a853a9c59af59fcf04384eeef3d4ad6121f2be) |
| challenge-upheld | VOID | [Finalized receipt](https://explorer-studio.genlayer.com/tx/0x6e894800defe61cac6beb17311cf4b08ce4fa273251115c9aa8fbcd2f4886fc7) |
| challenge-rejected | VOID | [Finalized receipt](https://explorer-studio.genlayer.com/tx/0x3c74ce1f89110cbfc3d4460ad18726bad89a17caa34c144f0b0704b67aa8ec12) |

## Current funded watches

| Watch | Bounty | Expiry (UTC) | Latest available baseline |
| --- | --- | --- | --- |
| Zoom · w_a52fda731efa43a7859aa6a06299fc01 | 100 wei | 2026-12-14T18:57:44.000Z | 20240718135835 |
| X · live_x_script | 100 wei | 2026-12-15T00:27:40.000Z | 20240517144758 |
| GitHub · live_github_script | 100 wei | 2026-12-15T05:57:20.000Z | 20261115040436 |

Current watches use their creation time as the as-of time. The latest successful archived capture can be older than the current policy; its timestamp is shown explicitly.

## Deployed contracts — StudioNet 61999

Each direct contract Explorer link is a separate evidence entry.

| Contract | GenLayer Explorer Contract |
| --- | --- |
| ArchiveProbe | [0x3af4ed87c46bcb30f296ab190da90f157b205694](https://explorer-studio.genlayer.com/address/0x3af4ed87c46bcb30f296ab190da90f157b205694) |
| Watches | [0x0f8683d22bef4c4867206876b42801eb8d779f2d](https://explorer-studio.genlayer.com/address/0x0f8683d22bef4c4867206876b42801eb8d779f2d) |
| Claims | [0xfce7e250ed1b8cb35f8c1af77760c501381982a6](https://explorer-studio.genlayer.com/address/0xfce7e250ed1b8cb35f8c1af77760c501381982a6) |
| Challenges | [0x1becb223f2b6c92e89d32e28b29c70c86aac1880](https://explorer-studio.genlayer.com/address/0x1becb223f2b6c92e89d32e28b29c70c86aac1880) |
| Bounties | [0xc321fd3bd9d611d067f43d1df6fa2c814c90656c](https://explorer-studio.genlayer.com/address/0xc321fd3bd9d611d067f43d1df6fa2c814c90656c) |
| ChangeLedger | [0x5ab754cc231a6a7f8726496ffa11ff19c8bcc13d](https://explorer-studio.genlayer.com/address/0x5ab754cc231a6a7f8726496ffa11ff19c8bcc13d) |

## Value and execution

Cumulative contract deposits: **848 wei / 1,110 wei approved**. Refunds and payouts do not reset this cumulative cap. The owner's separate **1,000-wei** native transfer funded the dedicated runner account and is not an escrow deposit: [funding receipt](https://explorer-studio.genlayer.com/tx/0xf8a14aa154066cd948507c570fc5f48bbafcffe586f7ba6cb11d2c3e22530a46).

The dedicated account acted as sponsor, hunter and challenger for scripted demonstrations. These runs demonstrate the validator and deterministic contract paths; they do not demonstrate independent market participation. The original owner-funded failures are retained. Fresh timing-recovery IDs are labeled explicitly, and no finalized judgment was rerun to force an expected outcome.

See [the runner guide](RUNNER.md), [the 90-second demo](DEMO.md), and the final verification report for the checks that actually completed.

## Unfunded current-watch attempts

| Attempt | Actual result | Deposit | Evidence |
| --- | --- | --- | --- |
| Adobe · live_adobe_script | VOID: Immutable baseline evidence unavailable; no funds accepted. | 0 wei | [Finalized receipt](https://explorer-studio.genlayer.com/tx/0xedd925c545a2ab20a205d180ae0ba46a34b3d605ece3fb4fe7be516977409af1) |

The Adobe VOID attempt was retained without a retry. A distinct GitHub policy and concern replaced it in the funded docket.

## Retained transaction errors

| Call | Actual execution | Disposition | Evidence |
| --- | --- | --- | --- |
| void_expired | FINISHED_WITH_ERROR | Cleanup called nonexistent void_expired; deployed method is timeout_claim. The failed 0-value call is preserved; the correct timeout uses a different journal key. | [Finalized error](https://explorer-studio.genlayer.com/tx/0x15e59c34f44ae22e050db287ba6b50e1c0b12501d59feafa4405212565512967) |

The incorrect zero-value cleanup call was not resubmitted. A new timeout-only action used the deployed `timeout_claim` method, without repeating a claim judgment or deposit.
