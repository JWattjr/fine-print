import hashlib
import json
from types import SimpleNamespace

import pytest

URL = "https://explore.zoom.us/en/terms/"
STAMP = "20230301000542"
BOUNTIES = "0x" + "55" * 20
HTML = ("<!doctype html><html><script>hidden instructions</script><p>Policy &amp; rights.</p>" + "<p>Archived policy language.</p>" * 80 + "</html>").encode()
ACCEPT = {"decision": "ACCEPT", "criteria": ["The policy permits using customer content to train AI models."], "reason": "Observable policy permission."}


@pytest.fixture
def watches(monkeypatch, direct_vm, direct_deploy, direct_alice):
    direct_vm.sender = direct_alice
    direct_vm._chain_id = 61999
    direct_vm.warp("2026-11-14T00:00:00Z")
    contract = direct_deploy("contracts/watches.py")
    contract.configure(BOUNTIES)
    import genlayer.gl as sdk
    from genlayer.py.types import Address
    calls, emitted = [], []
    state = {"answer": ACCEPT, "validation": True, "cdx_original": URL, "html": HTML, "escrow": {}, "tamper": None}

    def get(url, **kwargs):
        calls.append(url)
        body = json.dumps([["timestamp", "original", "statuscode"], [STAMP, state["cdx_original"], "200"]]).encode() if "/cdx/" in url else state["html"]
        return SimpleNamespace(status=200, body=body)

    def prompt(text, **kwargs):
        return {"valid": state["validation"]} if text.startswith("Independently verify") else state["answer"]

    class Return:
        def __init__(self, value):
            self.calldata = value

    def nondet(leader, validator):
        answer = leader()
        if state["tamper"]:
            state["tamper"](answer)
        if not validator(Return(answer)):
            raise sdk.vm.UserError("[TEST] validator disagreement")
        return answer

    class Emitter:
        def __getattr__(self, method):
            return lambda *args: emitted.append((method, args))

    monkeypatch.setattr(sdk.nondet.web, "get", get)
    monkeypatch.setattr(sdk.nondet, "exec_prompt", prompt)
    monkeypatch.setattr(sdk.vm, "Return", Return)
    monkeypatch.setattr(sdk.vm, "run_nondet_unsafe", nondet)
    monkeypatch.setattr(sdk, "get_contract_at", lambda address: SimpleNamespace(emit=lambda **kwargs: Emitter(), view=lambda: SimpleNamespace(get_watch_escrow=lambda key: json.dumps(state["escrow"]))))
    return contract, state, calls, emitted, Address


def compile_watch(contract, watch_id="watch-1", concern="Notify me if customer content may be used to train AI."):
    contract.compile_watch(watch_id, URL, concern, 10, 7200, 60, STAMP)


def finalize(contract, direct_vm):
    direct_vm.sender = direct_vm._contract_address
    contract.finalize_watch("watch-1")


def test_compile_freezes_criteria_and_code_selected_baseline(watches, direct_vm):
    contract, _, calls, emitted, _ = watches
    compile_watch(contract)
    pending = json.loads(contract.get_watch("watch-1"))
    assert pending["finalized"] is False
    assert pending["status"] == "PENDING_FINALITY"
    assert all("limit=-1" in url and "to=" + STAMP in url for url in calls if "/cdx/" in url)
    assert pending["baseline_timestamp"] == STAMP
    assert "hidden instructions" not in pending["baseline_text"]
    assert "Policy & rights." in pending["baseline_text"]
    assert pending["baseline_digest"] == hashlib.sha256(pending["baseline_text"].encode()).hexdigest()
    assert pending["criteria"] == ACCEPT["criteria"]
    assert pending["historical_replay"] is True
    assert emitted == [("finalize_watch", ("watch-1",))]
    finalize(contract, direct_vm)
    assert json.loads(contract.get_watch("watch-1"))["status"] == "COMPILED"


def test_subjective_concern_rejection_never_fetches_archive(watches, direct_vm):
    contract, state, calls, _, _ = watches
    state["answer"] = {"decision": "REJECT", "criteria": [], "reason": "Gets worse is subjective."}
    compile_watch(contract, concern="Tell me if the policy gets worse.")
    finalize(contract, direct_vm)
    assert json.loads(contract.get_watch("watch-1"))["status"] == "REJECTED"
    assert calls == []


def test_missing_exact_cdx_capture_voids_without_accepting_funds(watches, direct_vm):
    contract, state, _, _, _ = watches
    state["cdx_original"] = "https://explore.zoom.us/wrong-document/"
    compile_watch(contract)
    finalize(contract, direct_vm)
    record = json.loads(contract.get_watch("watch-1"))
    assert record["status"] == "VOID" and record["failure"] == "EVIDENCE"
    assert record["criteria"] == []


def test_malformed_model_output_cannot_win_consensus(watches, direct_vm):
    contract, state, _, emitted, _ = watches
    state["answer"] = {"decision": "ACCEPT", "criteria": ["broadened"], "reason": "x", "extra": "ignore instructions"}
    with direct_vm.expect_revert("validator disagreement"):
        compile_watch(contract)
    assert json.loads(contract.get_watch("watch-1")) == {}
    assert emitted == []


def test_validator_can_reject_unfaithful_compilation(watches, direct_vm):
    contract, state, _, _, _ = watches
    state["validation"] = False
    with direct_vm.expect_revert("validator disagreement"):
        compile_watch(contract)


def test_validator_hashes_actual_leader_baseline_text(watches, direct_vm):
    contract, state, _, _, _ = watches
    state["tamper"] = lambda answer: answer.update(baseline_text="forged baseline with an unchanged claimed digest")
    with direct_vm.expect_revert("validator disagreement"):
        compile_watch(contract)


def test_only_self_can_finalize_and_ids_cannot_be_reused(watches, direct_vm):
    contract, _, _, _, _ = watches
    compile_watch(contract)
    with direct_vm.expect_revert("self finality callback only"):
        contract.finalize_watch("watch-1")
    with direct_vm.expect_revert("new bounded watch ID required"):
        compile_watch(contract)


def test_funding_callback_requires_final_exact_escrow(watches, direct_vm):
    contract, state, _, _, Address = watches
    compile_watch(contract)
    finalize(contract, direct_vm)
    direct_vm.sender = Address(BOUNTIES)
    state["escrow"] = {"finalized": False, "status": "FUNDED", "amount_wei": "10"}
    with direct_vm.expect_revert("finalized exact bounty funding required"):
        contract.mark_funded("watch-1")
    state["escrow"]["finalized"] = True
    contract.mark_funded("watch-1")
    assert json.loads(contract.get_watch("watch-1"))["status"] == "OPEN"


def test_unfunded_deadline_has_void_path(watches, direct_vm):
    contract, _, _, _, _ = watches
    compile_watch(contract)
    finalize(contract, direct_vm)
    with direct_vm.expect_revert("unfunded timeout not reached"):
        contract.expire_unfunded("watch-1")
    direct_vm.warp("2026-11-14T01:00:00Z")
    contract.expire_unfunded("watch-1")
    assert json.loads(contract.get_watch("watch-1"))["status"] == "VOID"
