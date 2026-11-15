#!/usr/bin/env python3
"""Read-only verification of StudioNet proof and canonical Explorer records."""

from __future__ import annotations

import json
import base64
import hashlib
import re
import sys
import subprocess
import shutil
import time
from pathlib import Path
from typing import Any, Callable, TypeVar
from urllib.error import HTTPError, URLError
from urllib.parse import urlparse
from urllib.request import Request, urlopen

ROOT = Path(__file__).resolve().parents[1]
PROOF_PATH = ROOT / "deploy" / "proof.json"
EXPLORER = "https://explorer-studio.genlayer.com"
CHAIN_ID = 61999
MAX_DEPOSIT_WEI = 1000  # Owner's stricter shared cap; protocol cap is 0.1 GEN.
USER_AGENT = "Mozilla/5.0 FinePrintProofVerifier/1.0"
MIN_REQUEST_INTERVAL = 2.5
MAX_REQUESTS_PER_RUN = 450
REQUEST_TIMES: list[float] = []
RUNNER = "py-genlayer:1jb45aa8ynh2a9c9xn3b7qqh8sm5q93hwfp7jqmwsfhh8jpz09h6"
REQUIRED_CONTRACTS = {"ArchiveProbe", "Watches", "Claims", "Challenges", "Bounties", "ChangeLedger"}
REQUIRED_PROBES = {"zoom-baseline", "zoom-change", "x-baseline", "x-change", "adobe-baseline", "adobe-change", "zoom-ai-grant", "adobe-june-revision"}
REQUIRED_CASES = {
    "zoom-ai-training", "x-ai-training", "cosmetic-date-only",
    "challenge-upheld", "challenge-rejected", "concern-rejected", "baseline-passage-rejected", "injection-ignored",
}


def request_slot(last_request: list[float]) -> None:
    elapsed = time.monotonic() - last_request[0]
    if last_request[0] and elapsed < MIN_REQUEST_INTERVAL:
        time.sleep(MIN_REQUEST_INTERVAL - elapsed)
    budget_path = ROOT / ".source-cache" / "runner" / "request-times.json"
    budget_path.parent.mkdir(parents=True, exist_ok=True)
    times = json.loads(budget_path.read_text()) if budget_path.exists() else []
    now = time.time() * 1000
    times = [timestamp for timestamp in times if now - timestamp < 3600000]
    if len(times) >= 440:
        time.sleep(max(1, (times[0] + 3600000 - now + 1000) / 1000))
        now = time.time() * 1000
        times = [timestamp for timestamp in times if now - timestamp < 3600000]
    if times:
        time.sleep(max(0, (times[-1] + 2500 - time.time() * 1000) / 1000))
    times.append(time.time() * 1000)
    temporary = budget_path.with_suffix(".pending")
    temporary.write_text(json.dumps(times))
    temporary.replace(budget_path)
    REQUEST_TIMES.append(time.monotonic())
    last_request[0] = time.monotonic()


T = TypeVar("T")


def retry_read(operation: Callable[[], T]) -> T:
    for attempt in range(4):
        try:
            return operation()
        except (HTTPError, URLError, TimeoutError, OSError, ValueError) as error:
            transient = isinstance(error, (URLError, TimeoutError, json.JSONDecodeError))
            if isinstance(error, HTTPError):
                transient = error.code in {408, 429, 500, 502, 503, 504}
            if isinstance(error, ValueError) and re.search(r"temporar|unavailable|timeout|rate.limit", str(error), re.I):
                transient = True
            if not transient or attempt == 3:
                raise
            time.sleep(10)
    raise RuntimeError("Read retry exhausted.")


def fetch_json(url: str, last_request: list[float]) -> Any:
    return retry_read(lambda: fetch_json_once(url, last_request))


def fetch_json_once(url: str, last_request: list[float]) -> Any:
    request_slot(last_request)
    request = Request(url, headers={"User-Agent": USER_AGENT, "Accept": "application/json"})
    with urlopen(request, timeout=25) as response:
        body = response.read()
    last_request[0] = time.monotonic()
    return json.loads(body.decode("utf-8"))


def rpc_json(method: str, params: list[Any], last_request: list[float]) -> Any:
    return retry_read(lambda: rpc_json_once(method, params, last_request))


def rpc_json_once(method: str, params: list[Any], last_request: list[float]) -> Any:
    request_slot(last_request)
    body = json.dumps({"jsonrpc": "2.0", "id": 1, "method": method, "params": params}).encode("utf-8")
    request = Request("https://studio.genlayer.com/api", data=body, headers={
        "User-Agent": USER_AGENT,
        "Accept": "application/json",
        "Content-Type": "application/json",
    })
    with urlopen(request, timeout=25) as response:
        payload = json.loads(response.read().decode("utf-8"))
    last_request[0] = time.monotonic()
    if payload.get("error"):
        raise ValueError(text(payload["error"].get("message") if isinstance(payload["error"], dict) else payload["error"]))
    if "result" not in payload:
        raise ValueError("StudioNet RPC response has no result.")
    return payload["result"]


def fetch_page(url: str, last_request: list[float]) -> tuple[str, str]:
    return retry_read(lambda: fetch_page_once(url, last_request))


def fetch_page_once(url: str, last_request: list[float]) -> tuple[str, str]:
    request_slot(last_request)
    request = Request(url, headers={"User-Agent": USER_AGENT, "Accept": "text/html,*/*;q=0.8"})
    with urlopen(request, timeout=25) as response:
        final_url = response.geturl()
        body = response.read().decode("utf-8", errors="replace")
    last_request[0] = time.monotonic()
    return final_url, body


def text(value: Any) -> str:
    return str(value or "").strip()


def contract_address(value: Any) -> str:
    if isinstance(value, dict):
        value = value.get("address")
    address = text(value)
    return address if re.fullmatch(r"0x[0-9a-fA-F]{40}", address) else ""


def integer(value: Any, default: int | None = None) -> int | None:
    try:
        return int(value)
    except (TypeError, ValueError, OverflowError):
        return default


def is_hash(value: Any) -> bool:
    return isinstance(value, str) and re.fullmatch(r"0x[0-9a-fA-F]{64}", value) is not None


def receipt_for(proof: dict[str, Any], case_id: str, label: str, tx_hash: str) -> dict[str, Any] | None:
    receipts = proof.get("receipts") or {}
    for key in (f"{case_id}:{label}", label, tx_hash):
        value = receipts.get(key)
        if isinstance(value, dict) and text(value.get("hash", tx_hash)).lower() == tx_hash.lower():
            return value
    return None


def retained_failure(receipt: Any) -> bool:
    return isinstance(receipt, dict) and receipt.get("stage") == "FINALIZED_ERROR" and receipt.get("failureDisposition") == "RETAINED_NOT_RETRIED" and bool(receipt.get("failureReason"))


def collect_hashes(proof: dict[str, Any]) -> dict[str, str]:
    found: dict[str, str] = {}

    def add(label: str, value: Any) -> None:
        if isinstance(value, str) and re.fullmatch(r"0x[0-9a-fA-F]{64}", value):
            found[label] = value

    for label, value in (proof.get("transactions") or {}).items():
        add(f"transaction:{label}", value)
    add("runner-funding", (proof.get("runnerFunding") or {}).get("hash"))
    for name, value in (proof.get("contracts") or {}).items():
        if isinstance(value, dict):
            add(f"contract:{name}:deployment", value.get("transactionHash", value.get("txHash")))
    for case in proof.get("cases") or []:
        if not isinstance(case, dict):
            continue
        case_id = text(case.get("id")) or "unknown"
        for label, value in (case.get("transactions") or {}).items():
            add(f"case:{case_id}:{label}", value)
        add(f"case:{case_id}:transaction", case.get("transaction"))
        challenge = case.get("challenge") or {}
        if isinstance(challenge, dict):
            add(f"case:{case_id}:challenge", challenge.get("transactionHash"))
        payout = case.get("payout") or {}
        if isinstance(payout, dict):
            add(f"case:{case_id}:payout", payout.get("transactionHash"))
    for watch in proof.get("liveWatches") or []:
        if not isinstance(watch, dict):
            continue
        watch_id = text(watch.get("id")) or "unknown"
        for label, value in (watch.get("transactions") or {}).items():
            add(f"watch:{watch_id}:{label}", value)
    for label, value in (proof.get("receipts") or {}).items():
        if isinstance(value, dict):
            add(f"receipt:{label}", value.get("hash"))
    for attempt in proof.get("liveWatchAttempts") or []:
        if isinstance(attempt, dict):
            add(f"watch-attempt:{text(attempt.get('id'))}", attempt.get("transactionHash"))
    for transfer in proof.get("valueTransfers") or []:
        if isinstance(transfer, dict):
            add(f"value-transfer:{text(transfer.get('label')) or 'deposit'}", transfer.get("hash"))

    # Deduplicate by hash while retaining the first useful label.
    unique: dict[str, str] = {}
    for label, tx_hash in found.items():
        unique.setdefault(tx_hash.lower(), label)
    return unique


def progress(stage: str, checked: int, total: int) -> None:
    path = ROOT / ".source-cache" / "verify-proof-progress.json"
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps({"stage": stage, "checked": checked, "total": total,
                               "updatedAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())}))


def verify() -> list[str]:
    errors: list[str] = []
    REQUEST_TIMES.clear()
    try:
        proof = json.loads(PROOF_PATH.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as error:
        return [f"Cannot read {PROOF_PATH}: {error}"]

    network = proof.get("network") or {}
    if not isinstance(network, dict):
        network = {}
    if network.get("name") != "StudioNet" or integer(network.get("chainId"), -1) != CHAIN_ID:
        errors.append("Proof is not pinned to StudioNet chain 61999.")
    if network.get("rpc") != "https://studio.genlayer.com/api":
        errors.append("Proof RPC URL does not match the StudioNet endpoint.")
    if proof.get("runner") != RUNNER:
        errors.append("Proof does not use the required pinned GenVM runner.")

    try:
        deposited = int(proof.get("depositedWei", "0"))
    except (TypeError, ValueError):
        deposited = MAX_DEPOSIT_WEI + 1
    if deposited < 0 or deposited > MAX_DEPOSIT_WEI:
        errors.append(f"Recorded deposits exceed the owner's 1,000-wei cap: {deposited} wei.")

    blockers = [text(item) for item in proof.get("blockers") or [] if text(item)]
    if blockers:
        errors.append("Proof still lists blockers: " + "; ".join(blockers))

    last_request = [0.0]
    try:
        chain_value = rpc_json("eth_chainId", [], last_request)
        actual_chain = int(chain_value, 16) if isinstance(chain_value, str) and chain_value.startswith("0x") else int(chain_value)
        if actual_chain != CHAIN_ID:
            errors.append(f"StudioNet RPC reports chain {actual_chain}, expected {CHAIN_ID}.")
    except (HTTPError, URLError, TimeoutError, json.JSONDecodeError, OSError, ValueError, TypeError) as error:
        errors.append(f"StudioNet chain identity could not be verified: {error}")
    contracts = proof.get("contracts") or {}
    if not isinstance(contracts, dict):
        contracts = {}
        errors.append("The contract proof map is malformed.")
    missing_contracts = sorted(REQUIRED_CONTRACTS - set(contracts))
    if missing_contracts:
        errors.append("Required deployed contracts are missing: " + ", ".join(missing_contracts))
    seen_addresses: dict[str, str] = {}
    progress("contract-links", 0, len(contracts))
    for name, value in contracts.items():
        address = contract_address(value)
        if not address:
            errors.append(f"{name}: missing or invalid contract address.")
            continue
        canonical = f"{EXPLORER}/address/{address}"
        previous = seen_addresses.get(address.lower())
        if previous:
            errors.append(f"{name}: duplicates the deployed address recorded for {previous}.")
        else:
            seen_addresses[address.lower()] = name
        recorded_link = value.get("explorer") if isinstance(value, dict) else None
        if recorded_link != canonical:
            errors.append(f"{name}: Explorer URL is not canonical for {address}.")
        source_hash = text(value.get("sourceSha256")) if isinstance(value, dict) else ""
        source_file = ROOT / "contracts" / {
            "ArchiveProbe": "archive_probe.py",
            "Watches": "watches.py",
            "Claims": "claims.py",
            "Challenges": "challenges.py",
            "Bounties": "bounties.py",
            "ChangeLedger": "change_ledger.py",
        }.get(name, "__missing__")
        if not re.fullmatch(r"[0-9a-f]{64}", source_hash):
            errors.append(f"{name}: deployed source fingerprint is missing or malformed.")
        elif not source_file.is_file() or hashlib.sha256(source_file.read_bytes()).hexdigest() != source_hash:
            errors.append(f"{name}: local source does not match its recorded deployment fingerprint.")
        deploy_hash = value.get("transactionHash", value.get("txHash")) if isinstance(value, dict) else None
        deploy_hash = deploy_hash or (proof.get("transactions") or {}).get(f"deploy-{name}")
        if not is_hash(deploy_hash):
            errors.append(f"{name}: deployment transaction hash is missing.")
        else:
            receipt = (proof.get("receipts") or {}).get(f"deploy-{name}") or {}
            if text(receipt.get("stage")).upper() != "FINALIZED_SUCCESS":
                errors.append(f"{name}: successful finalized deployment receipt is missing.")
        try:
            response = fetch_json(f"{EXPLORER}/api/address/{address}", last_request)
        except (HTTPError, URLError, TimeoutError, json.JSONDecodeError, OSError, ValueError) as error:
            errors.append(f"{name}: Explorer address check failed: {error}")
            continue
        if not isinstance(response, dict) or text(response.get("type")).upper() != "CONTRACT":
            errors.append(f"{name}: Explorer API did not identify the address as a contract.")
        found_address = text(response.get("address")) if isinstance(response, dict) else ""
        if found_address.lower() != address.lower():
            errors.append(f"{name}: Explorer returned a different contract address.")
        found_chain = response.get("chainId", response.get("chain_id")) if isinstance(response, dict) else None
        if found_chain is not None and integer(found_chain) != CHAIN_ID:
            errors.append(f"{name}: Explorer reports chain {found_chain}, expected {CHAIN_ID}.")
        try:
            final_url, _ = fetch_page(canonical, last_request)
            parsed = urlparse(final_url)
            expected_path = f"/address/{address}"
            if parsed.scheme != "https" or parsed.netloc != "explorer-studio.genlayer.com" or parsed.path.rstrip("/").lower() != expected_path.lower():
                errors.append(f"{name}: canonical Explorer page did not open this StudioNet address.")
        except (HTTPError, URLError, TimeoutError, OSError, ValueError) as error:
            errors.append(f"{name}: canonical Explorer page failed to open: {error}")

    hashes = collect_hashes(proof)
    if not hashes:
        errors.append("No transaction hashes are recorded.")
    rpc_transactions: dict[str, dict[str, Any]] = {}
    expected_failures = {text(receipt.get("hash")).lower(): receipt for receipt in (proof.get("receipts") or {}).values() if retained_failure(receipt)}
    for index, (tx_hash, label) in enumerate(hashes.items()):
        progress("transaction-links", index, len(hashes))
        try:
            response = fetch_json(f"{EXPLORER}/api/transactions/{tx_hash}", last_request)
        except (HTTPError, URLError, TimeoutError, json.JSONDecodeError, OSError) as error:
            errors.append(f"{label}: Explorer transaction check failed: {error}")
            continue
        if not isinstance(response, dict):
            errors.append(f"{label}: Explorer returned no transaction record.")
            continue
        response = response.get("transaction", response)
        if not isinstance(response, dict):
            errors.append(f"{label}: Explorer transaction wrapper contains no transaction record.")
            continue
        found_hash = text(response.get("hash", response.get("transactionHash", response.get("transaction_hash"))))
        if found_hash.lower() != tx_hash.lower():
            errors.append(f"{label}: Explorer returned a different transaction hash.")
        try:
            chain_tx = rpc_json("eth_getTransactionByHash", [tx_hash], last_request)
            if not isinstance(chain_tx, dict):
                errors.append(f"{label}: StudioNet RPC returned no transaction receipt.")
            else:
                rpc_transactions[tx_hash.lower()] = chain_tx
                state = text(chain_tx.get("status")).upper()
                if state != "FINALIZED":
                    errors.append(f"{label}: StudioNet transaction is not finalized ({state or 'missing status'}).")
                consensus_data = chain_tx.get("consensus_data") or {}
                leaders = consensus_data.get("leader_receipt") if isinstance(consensus_data, dict) else []
                leaders = leaders if isinstance(leaders, list) else []
                leader = next((item for item in reversed(leaders) if isinstance(item, dict) and not item.get("vote")), leaders[-1] if leaders and isinstance(leaders[-1], dict) else {})
                execution = text(leader.get("execution_result", chain_tx.get("tx_execution_result"))).upper()
                result_name = text(chain_tx.get("result_name") or chain_tx.get("resultName") or {1: "AGREE", 6: "MAJORITY_AGREE"}.get(integer(chain_tx.get("result")))).upper()
                raw_type = chain_tx.get("type")
                tx_type = int(raw_type, 16) if isinstance(raw_type, str) and raw_type.startswith("0x") else integer(raw_type)
                transfer_only = tx_type == 0 and chain_tx.get("value_credited") is True and not consensus_data
                expected_failure = expected_failures.get(tx_hash.lower())
                if expected_failure:
                    if execution not in {"ERROR", "FINISHED_WITH_ERROR", "VM_ERROR"} or int(chain_tx.get("value", -1)) != 0:
                        errors.append(f"{label}: retained failed cleanup does not match its finalized zero-value error receipt.")
                    if result_name != text(expected_failure.get("consensus")).upper():
                        errors.append(f"{label}: retained failure consensus differs from the recorded receipt.")
                elif not transfer_only and execution not in {"SUCCESS", "FINISHED_WITH_RETURN"}:
                    errors.append(f"{label}: StudioNet execution did not return successfully ({execution or 'missing result'}).")
                if not expected_failure and not transfer_only and result_name not in {"AGREE", "MAJORITY_AGREE", "SUCCESS"}:
                    errors.append(f"{label}: StudioNet consensus did not agree ({result_name or 'missing result'}).")
                raw_result = leader.get("result")
                if isinstance(raw_result, str) and raw_result:
                    try:
                        decoded_result = base64.b64decode(raw_result, validate=False)
                        if not expected_failure and decoded_result[:1] == b"\x01":
                            errors.append(f"{label}: StudioNet receipt records a rollback result.")
                    except (ValueError, TypeError):
                        pass
        except (HTTPError, URLError, TimeoutError, json.JSONDecodeError, OSError, ValueError) as error:
            errors.append(f"{label}: StudioNet RPC receipt check failed: {error}")
        try:
            final_url, _ = fetch_page(f"{EXPLORER}/tx/{tx_hash}", last_request)
            parsed = urlparse(final_url)
            if parsed.scheme != "https" or parsed.netloc != "explorer-studio.genlayer.com" or parsed.path.rstrip("/").lower() != f"/tx/{tx_hash}".lower():
                errors.append(f"{label}: canonical Explorer page did not open this transaction.")
        except (HTTPError, URLError, TimeoutError, OSError, ValueError) as error:
            errors.append(f"{label}: canonical Explorer page failed to open: {error}")

    cases = proof.get("cases") or []
    if not isinstance(cases, list):
        cases = []
        errors.append("The historical case list is malformed.")
    case_ids = [text(case.get("id")) for case in cases if isinstance(case, dict)]
    if len(case_ids) != len(set(case_ids)):
        errors.append("A historical case ID appears more than once; each replay must be recorded once.")
    covered_cases = set(case_ids) | {text(case.get("sourceCaseId")) for case in cases if isinstance(case, dict)}
    receipts_map = proof.get("receipts") or {}
    for failure in proof.get("caseFailures") or []:
        # A case whose judgment never reached validator agreement stays covered only by a retained, not-retried finalized error.
        if isinstance(failure, dict) and retained_failure(receipts_map.get(text(failure.get("receiptKey")))):
            covered_cases.add(text(failure.get("caseId")))
    missing_cases = sorted(REQUIRED_CASES - covered_cases)
    if missing_cases:
        errors.append("Required demo cases are missing: " + ", ".join(missing_cases))
    for case in cases:
        if not isinstance(case, dict):
            errors.append("A case record is malformed.")
            continue
        case_id = text(case.get("id")) or "unknown"
        txs = case.get("transactions") or {}
        if not isinstance(txs, dict):
            errors.append(f"{case_id}: transaction map is malformed.")
            txs = {}
        if not txs and not case.get("transaction"):
            errors.append(f"{case_id}: no finalized case transaction is recorded.")
        status = text(case.get("finalStatus", case.get("status"))).upper()
        if status != "FINALIZED_SUCCESS":
            errors.append(f"{case_id}: case transaction did not finalize successfully ({status or 'missing status'}).")
        if case.get("finalized") is not True:
            errors.append(f"{case_id}: finalized case state is not read back and recorded.")
        if case.get("stateVerified") is not True or case.get("stateReadback") is None:
            errors.append(f"{case_id}: the finalized case state readback is missing or unverified.")
        case_hashes = list(txs.values())
        if case.get("transaction"):
            case_hashes.append(case.get("transaction"))
        if any(not is_hash(tx_hash) for tx_hash in case_hashes):
            errors.append(f"{case_id}: a transaction hash is malformed.")
        if len([value.lower() for value in case_hashes if is_hash(value)]) != len(set(value.lower() for value in case_hashes if is_hash(value))):
            errors.append(f"{case_id}: a transaction is duplicated within the one-time case record.")
        for label, tx_hash in txs.items():
            if not is_hash(tx_hash):
                continue
            receipt = receipt_for(proof, case_id, text(label), tx_hash)
            if not receipt or (text(receipt.get("stage")).upper() != "FINALIZED_SUCCESS" and not retained_failure(receipt)):
                errors.append(f"{case_id}:{label}: successful finalized receipt is missing from the proof journal.")
        if case.get("transaction") and not txs:
            receipt = receipt_for(proof, case_id, "transaction", case["transaction"])
            if not receipt or text(receipt.get("stage")).upper() != "FINALIZED_SUCCESS":
                errors.append(f"{case_id}: successful finalized receipt is missing from the proof journal.")

    # The owner requires actual outcomes, including timeouts, rather than reruns
    # until a planned verdict is obtained. Evidence checks above remain strict.
    for case in cases:
        if not isinstance(case, dict):
            continue
        if text(case.get("verdict")).upper() not in {"TRIGGERED", "NOT_TRIGGERED", "UNCLEAR", "REJECTED", "CODE_REJECTED", "VOID", "NO_AGREEMENT"}:
            errors.append(f"{text(case.get('id'))}: actual terminal outcome is missing.")
        if case.get("sourceCaseId") and case.get("sourceCaseId") != case.get("id") and case.get("runLabel") != "re-run after a timing failure":
            errors.append(f"{text(case.get('id'))}: timing recovery must be explicitly labeled.")

    probe_results = proof.get("probeResults") or {}
    if not isinstance(probe_results, dict):
        probe_results = {}
        errors.append("ArchiveProbe results are malformed.")
    for probe_id in sorted(REQUIRED_PROBES):
        result = probe_results.get(probe_id)
        if not isinstance(result, dict) or text(result.get("stage")).upper() != "FINALIZED_SUCCESS" or result.get("passed") is not True:
            errors.append(f"ArchiveProbe source check {probe_id} has no successful finalized result.")
        elif not isinstance(result.get("result"), dict) or result["result"].get("cdx_match") is not True or result["result"].get("archive_marker") is not True:
            errors.append(f"ArchiveProbe source check {probe_id} is missing its exact CDX and immutable snapshot readback.")

    live_watches = proof.get("liveWatches") or []
    if not isinstance(live_watches, list):
        live_watches = []
        errors.append("The live watch list is malformed.")
    if not 3 <= len(live_watches) <= 4:
        errors.append(f"Expected 3–4 open production watches; found {len(live_watches)}.")
    for watch in live_watches:
        if not isinstance(watch, dict) or watch.get("historicalReplay") is True or text(watch.get("status")).upper() != "OPEN":
            errors.append("A live watch is not recorded as an open production watch.")
            continue
        if not text(watch.get("expiresAt")) or (integer(watch.get("bountyWei"), -1) or -1) <= 0:
            errors.append(f"{text(watch.get('id')) or 'live watch'}: expiry and funded bounty are required.")
        if watch.get("stateVerified") is not True or watch.get("historicalReplay") is True:
            errors.append(f"{text(watch.get('id')) or 'live watch'}: on-chain production watch state is not verified.")
        txs = watch.get("transactions") or {}
        if not isinstance(txs, dict) or not txs:
            errors.append(f"{text(watch.get('id')) or 'live watch'}: creation and funding receipts are missing.")
        else:
            for label, tx_hash in txs.items():
                receipt = receipt_for(proof, text(watch.get("id")), text(label), tx_hash) if is_hash(tx_hash) else None
                if not receipt or text(receipt.get("stage")).upper() != "FINALIZED_SUCCESS":
                    errors.append(f"{text(watch.get('id'))}:{label}: successful finalized receipt is missing.")

    value_transfers = proof.get("valueTransfers")
    if not isinstance(value_transfers, list):
        errors.append("A transaction-level value transfer ledger is missing; the 1,000-wei cap cannot be independently checked.")
    else:
        transfer_total = 0
        transfer_hashes: set[str] = set()
        for transfer in value_transfers:
            if not isinstance(transfer, dict):
                errors.append("A value transfer record is malformed.")
                continue
            amount = integer(transfer.get("amountWei"), -1)
            tx_hash = transfer.get("hash")
            if amount is None or amount < 0 or not is_hash(tx_hash):
                errors.append("A value transfer has a malformed amount or transaction hash.")
                continue
            if tx_hash.lower() in transfer_hashes:
                errors.append(f"Value transfer {tx_hash} appears more than once.")
            transfer_hashes.add(tx_hash.lower())
            chain_tx = rpc_transactions.get(tx_hash.lower())
            if chain_tx is None:
                errors.append(f"Value transfer {tx_hash} is not a recorded, verified StudioNet transaction.")
            else:
                escrow_address = contract_address(contracts.get("Bounties")).lower()
                if text(chain_tx.get("to_address")).lower() != escrow_address or text(chain_tx.get("from_address")).lower() == escrow_address:
                    errors.append(f"Value transfer {tx_hash} is not an incoming external Bounties deposit.")
                raw_amount = chain_tx.get("value", chain_tx.get("value_wei"))
                try:
                    chain_amount = int(raw_amount, 16) if isinstance(raw_amount, str) and raw_amount.startswith("0x") else int(raw_amount)
                except (TypeError, ValueError, OverflowError):
                    chain_amount = None
                if chain_amount is None:
                    errors.append(f"Value transfer {tx_hash} has no readable on-chain native value.")
                elif chain_amount != amount:
                    errors.append(f"Value transfer {tx_hash} records {amount} wei but StudioNet reports {chain_amount} wei.")
            if chain_tx is None or chain_tx.get("value_credited") is not False:
                transfer_total += amount
        recorded_positive_hashes = {str(item.get("hash", "")).lower() for item in value_transfers if isinstance(item, dict)}
        for tx_hash, chain_tx in rpc_transactions.items():
            raw_amount = chain_tx.get("value", chain_tx.get("value_wei"))
            try:
                chain_amount = int(raw_amount, 16) if isinstance(raw_amount, str) and raw_amount.startswith("0x") else int(raw_amount)
            except (TypeError, ValueError, OverflowError):
                continue
            escrow_address = contract_address(contracts.get("Bounties")).lower()
            incoming_deposit = escrow_address and text(chain_tx.get("to_address")).lower() == escrow_address and text(chain_tx.get("from_address")).lower() != escrow_address
            if chain_amount > 0 and incoming_deposit and tx_hash not in recorded_positive_hashes:
                errors.append(f"Transaction {tx_hash} carries {chain_amount} wei but is missing from the value transfer ledger.")
        if transfer_total != deposited:
            errors.append(f"Value transfer ledger totals {transfer_total} wei but depositedWei records {deposited}.")

    portal_path = ROOT / "docs" / "submission" / "portal-fields.json"
    try:
        portal = json.loads(portal_path.read_text(encoding="utf-8"))
        evidence = portal.get("evidence") or []
        evidence_urls: set[str] = set()
        for item in evidence:
            if isinstance(item, str):
                evidence_urls.update(re.findall(r"https://\S+", item))
            elif isinstance(item, dict):
                evidence_urls.add(text(item.get("url")))
        for name, value in contracts.items():
            address = contract_address(value)
            if address and f"{EXPLORER}/address/{address}" not in evidence_urls:
                errors.append(f"Portal fields are missing the separate GenLayer Explorer Contract evidence for {name}.")
            if address and f"{EXPLORER}/address/{address}" not in (portal.get("contractLinks") or []):
                errors.append(f"Portal fields are missing the direct contract link for {name}.")
    except (OSError, json.JSONDecodeError) as error:
        errors.append(f"Cannot check submission evidence entries: {error}")

    node = shutil.which("node")
    progress("finalized-contract-state", len(hashes), len(hashes))
    if not node:
        errors.append("Node.js is required for independent finalized contract-state checks.")
    else:
        try:
            checked = subprocess.run([node, "--import", "tsx", "scripts/verify_finalized_state.ts", "1000"], cwd=ROOT, text=True, capture_output=True, timeout=10800, check=False)
            result = json.loads(checked.stdout)
            errors.extend(str(error) for error in result.get("errors", []))
            if checked.returncode and not result.get("errors"):
                errors.append("Finalized contract-state verifier failed without a safe report.")
        except (OSError, subprocess.TimeoutExpired, json.JSONDecodeError) as error:
            errors.append(f"Independent finalized contract-state checks could not complete: {error}")

    return errors


if __name__ == "__main__":
    problems = verify()
    proof = json.loads(PROOF_PATH.read_text(encoding="utf-8"))
    link_errors = [problem for problem in problems if "Explorer" in problem or "canonical" in problem]
    report = {
        "ok": not problems,
        "verifiedAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "network": proof["network"],
        "contracts": len(proof.get("contracts") or {}),
        "transactions": len(collect_hashes(proof)),
        "depositedWei": proof.get("depositedWei", "0"),
        "depositCapWei": str(MAX_DEPOSIT_WEI),
        "errors": problems,
        "explorerContractLinks": [f"{EXPLORER}/address/{contract_address(value)}" for value in (proof.get("contracts") or {}).values()],
        "explorerTransactionLinks": [f"{EXPLORER}/tx/{value}" for value in collect_hashes(proof)],
        "explorerChecks": "all canonical contract and transaction API endpoints and pages checked" if not link_errors else "Explorer link checks failed; see explorerLinkErrors",
        "explorerLinksVerified": not link_errors,
        "explorerLinkErrors": link_errors,
        "actualCases": [{"id": item.get("id"), "sourceCaseId": item.get("sourceCaseId"), "verdict": item.get("verdict"), "challenge": (item.get("challenge") or {}).get("ruling"), "nativeCreditVerified": (item.get("payout") or {}).get("creditVerified", False)} for item in proof.get("cases") or []],
        "retainedFinalizedErrors": [{"hash": item.get("hash"), "method": item.get("method"), "reason": item.get("failureReason")} for item in (proof.get("receipts") or {}).values() if retained_failure(item)],
    }
    report_path = ROOT / ".source-cache" / "verify-proof-report.json"
    report_path.parent.mkdir(parents=True, exist_ok=True)
    report_path.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    progress("complete", len(collect_hashes(proof)), len(collect_hashes(proof)))
    if problems:
        print(json.dumps(report, indent=2))
        sys.exit(1)
    print(json.dumps(report, indent=2))
