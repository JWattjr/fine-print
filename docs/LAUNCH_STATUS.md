# Launch status (v2)

- v1 contract set is **superseded (cosmetic false positive)**; its receipts are kept in `deploy/v1/`.
- v2: Watches, Claims, Challenges, Bounties and ChangeLedger redeployed and configured as a fresh set on StudioNet 61999. ArchiveProbe is unchanged. Addresses are in `deploy/contracts.json` and `docs/RESULTS.md`.
- Scripted runner cases finished: 5 reached a verdict (x-ai-training TRIGGERED and paid, concern-rejected REJECTED, baseline-passage-rejected CODE_REJECTED, cosmetic-date-only NOT_TRIGGERED, injection-ignored TRIGGERED with challenge REJECTED and paid), challenge-upheld ended in a retained validator disagreement, and both Zoom 2023 cases finalized VOID.
- Live watches funded: Zoom, X and GitHub, 100 wei each.
- Contract deposits: see `deploy/proof.json` (`depositedWei`) against the 1,000-wei cap.
- No Portal form has been submitted.
