# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

Next.js App Router with strict TypeScript, per the build brief.

## Users

People who want to monitor a company policy for a specific, observable change; sponsors who fund that watch; hunters who find and submit evidence; and reviewers who inspect finalized decisions.

## Product Purpose

Fine Print funds public watches on company policies. GenLayer validators judge whether a newly archived passage meets frozen criteria. Code controls bounties, bonds, deadlines and payout eligibility.

## Positioning

Bounties for catching what changed in the fine print. GenLayer validators decide if it matters.

## Operating Context

All evidence is fetched from the Internet Archive Wayback Machine. New text is normalized and verified in code before a judgment. Historical replays are labeled separately from production watches. Finalized outcomes are published in an append-only Change Ledger.

## Capabilities and Constraints

The brief requires five independently deployed GenLayer contracts: Watches, Claims, Challenges, Bounties and ChangeLedger. Contracts target StudioNet chain 61999 with the pinned `py-genlayer` runner and the requested genlayer-py / genlayer-js versions. Policy evidence must use 14-digit Wayback `id_` snapshot URLs verified through CDX. The model cannot set monetary amounts. Historical demo results must only be shown as proven after corresponding live transactions finalize and state is read back. The frontend is desktop-only for this deliverable.

## Brand Commitments

Product name: Fine Print. Requested visual direction: investigative redline, with old and new text displayed side by side and the caught passage highlighted as a tracked change.

## Evidence on Hand

No verified case snapshots or deployed contract addresses were provided. Do not fabricate them or present mock outcomes as live proof. The build brief names candidate Zoom, X and Adobe policy changes; each candidate must be checked against CDX and archived snapshots before it appears as verified.

## Product Principles

- Code owns every amount, deadline and payout.
- Validators judge frozen, observable criteria against independently fetched archive evidence.
- Historical replays are labeled as replays.
- Unavailable evidence times out to a void and refund.
- Only finalized outcomes enter the public ledger.

## Accessibility & Inclusion

Use keyboard-operable controls, explicit transaction states and readable quoted evidence. Desktop is the only required device class for this build.
