# Contract boundaries and settlement

Six initial archive captures passed the deployed ArchiveProbe on StudioNet before main contract authoring began. Text inspection then showed that Zoom's August 12 capture was the later clarification and the first Adobe pair had identical normalized text. The original Zoom August 9 grant and Adobe's June 19 capture of its June 18 revision are additional required probes before deployment. Every accepted source requires a finalized successful receipt and state readback in `deploy/proof.json`.

## Responsibilities

| Contract | Authoritative state | Judgment |
| --- | --- | --- |
| Watches | Frozen concern, criteria, baseline URL/text/digest, expiry and replay label | Compile an observable concern into 1–3 criteria |
| Claims | Later capture, verified passage, per-criterion results and challenge deadline | Does the new passage trigger each frozen criterion? |
| Challenges | Challenge evidence, ruling and closure of challenge intake | Did the substance already exist, or is this the wrong document? |
| Bounties | Deposit tickets, escrow, bonds, refunds, reserved pulls and native credit proof | None |
| ChangeLedger | Append-only settled changes and finalized hunter statistics | None |

The app owns previews, navigation, transaction tracking and cached proof. Wayback owns the source documents. Contracts fetch the archive independently; participant text and snapshot text never become instructions. Contract code controls all amounts and deadlines.

## Finality and permissions

Each contract is deployed with its creator as owner and has one immutable configuration step for peer addresses. Finality callbacks authenticate the sending contract. Self callbacks additionally authenticate the contract's own address and bind the callback to the current record/version. Accepted judgments have no settlement authority. `emit(on='finalized')` promotes a pending record after the native appeal process.

Views return JSON records with an explicit `finalized` flag. Consumers check the flag and expected state; an accepted state cannot authorize payment or a ledger append. Browser RPC calls checksum addresses before reading because StudioNet's state lookup distinguishes address casing.

## Funding and claims

Compilation and evidence preparation send no native value. The sponsor reviews a compiled watch before funding it. Claims prepare exact archive evidence before accepting a bond. A failed passage check creates a recorded code rejection without an LLM call or a bond loss.

Bounties validates a zero-value deposit ticket before a payable action. A ticket binds sender, purpose, record ID, exact wei and expiry. An unexpected or duplicate deposit becomes refundable credit instead of disappearing behind a failed payable call. Bounties is the only application contract that accepts native value.

Claim judgment independently fetches and normalizes both archives again. It requires the exact later URL, a capture after the baseline, passage presence in the later text and absence from the baseline. Validators compare verdicts, verify the leader quotes against their own fetch, and can choose different supporting quotes. Missing evidence produces VOID and a refund path.

## Challenges and closure

Challenge intake is limited to the finalized claim's challenge window. ALREADY_EXISTED verifies an exact baseline passage before judging substance. WRONG_DOCUMENT compares bounded extracts and document metadata. Arguments are untrusted context. A pending challenge prevents settlement. After the window, a finalized closure record seals intake and confirms that every challenge is resolved or timed out to VOID.

## Native pulls and the ledger

Settlement allocates deterministic credits only after finalized decisions and challenge closure. A pull reserves one credit and emits one native transfer. `verify_claim` binds a finalized parent transaction's calldata to the credit ID and attempt, checks its linked native child, destination, amount and `value_credited`. A failed child can restore the reserved credit; unknown evidence cannot authorize a second payment. Deadlines expose refund or resolution methods, with evidence required when a native transfer's result must be distinguished from an unpaid transfer.

Only Bounties can request a ledger append, after finalized native credit verification. ChangeLedger re-reads the watch, claim, challenge closure and settlement. It rejects any unfinalized, voided, unpaid or challenged record. Entries are immutable and unique per claim. Separate authenticated callbacks record finalized rejected claims and challenge wins exactly once.

## Verification

Direct tests stub cross-contract views and emitted calls, web responses and model responses. They exercise permissions, duplicate actions, deadlines, refunds, quote provenance and every verdict. Live tests supply the independent validator agreement, native finality and actual native credit evidence that mocks cannot establish.
