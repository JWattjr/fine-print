# Fine Print

Public app: https://fine-print-ten.vercel.app/ · Source: https://github.com/JWattjr/fine-print

Execution status: the v2 contract set is deployed and the scripted runs and current-watch funding are complete. Actual results and receipts are in [docs/RESULTS.md](docs/RESULTS.md). v1 is superseded (cosmetic false positive) and kept for reference in [`deploy/v1/`](deploy/v1/proof.json).

v2 fixes the v1 cosmetic false positive at the source: affirmative single-passage criteria, a code guard against negation and absence criteria, and a 40-character quote floor for TRIGGERED. The date-only case now finalizes NOT_TRIGGERED with the bond forfeited. Not every demonstration landed: the ALREADY_EXISTED/UPHELD case ended in a validator disagreement (retained, not retried), and both Zoom 2023 judgments finalized VOID because validators could not fetch the archive. See [the runner guide](docs/RUNNER.md).

Fine Print is an archive-backed policy change bounty desk. A sponsor freezes a specific concern against a Wayback baseline. Hunters submit a later archived passage. GenLayer validators judge whether the passage meets the frozen checks, while deterministic contract code controls funding, bonds, deadlines, refunds and payouts.

The public app reads its displayed receipts from [`deploy/proof.json`](deploy/proof.json). It does not present a candidate case as a finalized catch. Each production receipt needs a finalized StudioNet transaction, contract state readback, a closed challenge window and verified native credit. Historical replays and current watches are stored separately.

## Network and pinned tools

- StudioNet, chain ID `61999`
- RPC: `https://studio.genlayer.com/api`
- Explorer: `https://explorer-studio.genlayer.com`
- `genlayer-js` `1.1.8`
- `genlayer-py` `0.18.0`
- Pinned runner: `py-genlayer:1jb45aa8ynh2a9c9xn3b7qqh8sm5q93hwfp7jqmwsfhh8jpz09h6`
- Evidence: exact successful Wayback CDX rows and immutable `id_` snapshots only

The deployment journal stores transaction hashes before polling. A pending or accepted result remains pending in the interface. The app reads state again after finality before displaying a durable result. The transaction level value ledger is checked against the owner's stricter cumulative cap of 1,000 wei.

## Architecture

```mermaid
flowchart LR
  Sponsor --> Watches
  Watches -->|compile concern judgment| GenLayer
  Watches --> Claims
  Hunter --> Claims
  Claims -->|criterion judgment| GenLayer
  Hunter --> Challenges
  Challenges -->|archive dispute judgment| GenLayer
  Watches --> Bounties
  Claims --> Bounties
  Challenges --> Bounties
  Bounties -->|closed window + verified credit| ChangeLedger
  ChangeLedger --> PublicApp
  ArchiveProbe -. checks validator archive access .-> Wayback
```

The five application contracts have separate jobs: Watches freezes criteria and baselines; Claims validates later evidence and records per-criterion judgments; Challenges resolves bounded archive disputes; Bounties owns all native value and deadlines; ChangeLedger appends only finalized, settled records. Six initial captures passed ArchiveProbe before main authoring. Source inspection then identified two additional captures for the actual Zoom grant and Adobe revision; both passed ArchiveProbe before the main contracts were deployed. See [source selection](docs/SOURCE_SELECTION.md).

## Local setup

Use Node.js 20.9 or newer and Python 3.11 or newer. Install the Python packages in `requirements.txt`, then install the locked JavaScript dependencies and start the app:

```powershell
python -m pip install -r requirements.txt
npm ci
npm run dev
```

Open `http://localhost:3120`. The desk, ledger, watch docket, hunter index and case pages are readable without a wallet. Interactive actions use an injected StudioNet wallet. The dedicated runner signs its own fixed-plan transactions using a gitignored local key; the owner signed one separate funding transfer. Bounty and bond deposits remain separate writes within the shared cap.

## Checks

```powershell
npm run typecheck
npm run lint
npm test
npm run test:contract
npm run build
npm run verify:proof
npm run release
```

`verify:proof` is a read-only release gate. It checks the pinned network and runner, the required deployed addresses, canonical StudioNet Explorer address and transaction pages, finalized transaction receipts, the one-time historical case IDs and outcomes, the 3–4 open production watches, Portal contract evidence entries and the value transfer cap. It returns an error for missing or inconsistent evidence and retained readiness blockers. `release` runs that proof gate, the code checks and the production build. It never creates or edits a Portal submission.

Final evidence audit: all six contract links and 148 transaction links verified. The corrected complete state recheck passed with 72 RPC requests, 66 distinct state reads and zero errors. The readiness gate remains failed for the retained Zoom timing failure and cosmetic compiler false positive. See [the verification record](docs/VERIFICATION.md) and [its JSON report](docs/VERIFICATION.json).

## Release sequence

1. Verify Wayback CDX rows and immutable snapshots with ArchiveProbe on StudioNet, including both snapshots for Zoom, X and Adobe.
2. Deploy Watches, Claims, Challenges, Bounties and ChangeLedger with the pinned runner. Save each transaction hash immediately and wait for finality.
3. Replay each requested historical case once. Read the contract state after each transaction; retain the actual validator verdict, challenge ruling and settlement result.
4. Create 3–4 funded production watches with explicit expiry. Record every incoming contract deposit and keep the cumulative total at or below the owner's 1,000-wei cap.
5. Run the proof verifier. Open every emitted Explorer contract link and confirm the address and StudioNet contract record.
6. Deploy the app and publish the source repository. Prepare Portal fields and separate Explorer Contract evidence entries for review; do not submit them automatically.

See [`docs/TUTORIAL.md`](docs/TUTORIAL.md) for the user walkthrough and [`docs/DEMO.md`](docs/DEMO.md) for the short presentation sequence.

<!-- BEGIN ACTUAL RESULTS -->

## Actual results (v2)

| # | Case | Actual finalized result | Evidence |
| --- | --- | --- | --- |
| 1 | x-ai-training | TRIGGERED · 10 wei paid, native credit verified | [Receipt](https://explorer-studio.genlayer.com/tx/0x56ad8f3673c0dafdcec1d6d75a6b25fd2dc3d7f794ae6708fffed86728b23643) |
| 2 | concern-rejected | REJECTED | [Receipt](https://explorer-studio.genlayer.com/tx/0x047bb4913cdb0b13c100c46fb0938cc5ee5efc83cccebdd3ef5ed5b434ae11f7) |
| 3 | baseline-passage-rejected | CODE_REJECTED | [Receipt](https://explorer-studio.genlayer.com/tx/0xa6a07f946450d3fae594f7c96b9a50984724d960701fe366351d4603fd200482) |
| 4 | cosmetic-date-only | NOT_TRIGGERED · claim bond forfeited | [Receipt](https://explorer-studio.genlayer.com/tx/0x92118106af0fad1b65d5ce47421b0eb7af6840c92833d65113c67a183a7da467) |
| 5 | injection-ignored | TRIGGERED · challenge REJECTED · 10 wei paid, native credit verified | [Receipt](https://explorer-studio.genlayer.com/tx/0x7e8d4c1b3aef5e8bd19ec51354bc95381bc5b0bc5c94aecf62d9b1c75831ffad) |
| 6 | challenge-upheld | RETAINED FAILURE: judge_claim finalized FINISHED_WITH_ERROR (MAJORITY_DISAGREE); validators did not agree. Not retried; no verdict recorded. | [Receipt](https://explorer-studio.genlayer.com/tx/0x0e8544e160a0fbd448bc8074898e1dbd83a08b346efc2d2013e8eaaf240414de) |
| 7 | challenge-rejected | VOID · "Archive evidence unavailable; refund required." | [Receipt](https://explorer-studio.genlayer.com/tx/0x780b717783543b8b7e3d8d156744b34f63f20ce17fc096c7cf65eabe0fd43acb) |
| 8 | zoom-ai-training | VOID · "Archive evidence unavailable; refund required." | [Receipt](https://explorer-studio.genlayer.com/tx/0x974928d73ef36ca8fbc1e6d5b145f267cb79cdfb8ae336d508146f7cb86c922e) |

**Contract deposits: 367 / 1,000 wei.** Current funded watches: 3. Contracts: [ArchiveProbe](https://explorer-studio.genlayer.com/address/0x3af4ed87c46bcb30f296ab190da90f157b205694), [Watches](https://explorer-studio.genlayer.com/address/0xacd153a9ce2a2a762c0a719fd34ffff468d87baa), [Claims](https://explorer-studio.genlayer.com/address/0x608052285ce346ecfe5eafb8d94a3c0f4c3cb07a), [Challenges](https://explorer-studio.genlayer.com/address/0xb7fcf75f7462198c0f3aa4dbcb7f9067c7781838), [Bounties](https://explorer-studio.genlayer.com/address/0xc8fd789dccf626ccc93318987a59c160d79738d4), [ChangeLedger](https://explorer-studio.genlayer.com/address/0x969c8e8094df9174e75f60b7db76c3aa23954fb3). Full detail in [the complete results](docs/RESULTS.md).

<!-- END ACTUAL RESULTS -->
