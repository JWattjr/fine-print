import copy
import hashlib
import json
from types import SimpleNamespace

import pytest

URL = "https://explore.zoom.us/en/terms/"
OLD = "20230301000542"
NEW = "20230812065407"
PASSAGE = "We may use your content to train AI models."
OLD_TEXT = ("Old policy rights.\n" + "Archive language.\n" * 80).strip()
OLD_HTML = ("<html><p>Old policy rights.</p>" + "<p>Archive language.</p>" * 80 + "</html>").encode()
NEW_HTML = OLD_HTML.replace(b"</html>", ("<p>" + PASSAGE + "</p></html>").encode())
WATCHES, BOUNTIES, CHALLENGES, LEDGER = ["0x" + byte * 20 for byte in ("22", "33", "44", "55")]


@pytest.fixture
def claims(monkeypatch, direct_vm, direct_deploy, direct_alice):
    direct_vm.sender = direct_alice
    direct_vm._chain_id = 61999
    direct_vm.warp("2026-11-14T00:00:00Z")
    contract = direct_deploy("contracts/claims.py")
    contract.configure(WATCHES, BOUNTIES, CHALLENGES, LEDGER)
    import genlayer.gl as sdk
    from genlayer.py.types import Address
    hunter = str(Address(direct_alice)).lower()
    watch = {"id": "watch-1", "url": URL, "status": "OPEN", "finalized": True, "expires_at": 1794621600,
             "baseline_timestamp": OLD, "baseline_digest": hashlib.sha256(OLD_TEXT.encode()).hexdigest(),
             "criteria_hash": "frozen", "criteria": ["Permits training AI on customer content"], "bond_wei": "1", "challenge_seconds": 60}
    bond = {"status": "FUNDED", "finalized": True, "owner": hunter, "amount_wei": "1", "kind": "CLAIM"}
    state = {"watch": watch, "bond": bond, "tamper": None, "verdict": "TRIGGERED", "own_verdict": None, "different_quotes": False, "model_calls": 0, "web_calls": [], "emitted": [], "new_html": NEW_HTML, "bad_quote": False}

    class View:
        def get_watch(self, key):
            return json.dumps(watch)

        def get_bond(self, key):
            return json.dumps(bond)

    class Emitter:
        def __getattr__(self, method):
            return lambda *args: state["emitted"].append((method, args))

    def get(url, **kwargs):
        state["web_calls"].append(url)
        if "/cdx/" in url:
            stamp = OLD if "from=" + OLD in url else NEW
            return SimpleNamespace(status=200, body=json.dumps([["timestamp", "original", "statuscode"], [stamp, URL, "200"]]).encode())
        return SimpleNamespace(status=200, body=OLD_HTML if "/" + OLD + "id_/" in url else state["new_html"])

    def prompt(text, **kwargs):
        assert "untrusted document or participant text" in text
        state["model_calls"] += 1
        quote = "train AI models" if state["model_calls"] % 2 else "your content"
        if not state["different_quotes"]:
            quote = "train AI models"
        if state["bad_quote"]:
            quote = "this quote was invented"
        verdict = state["own_verdict"] if state["model_calls"] % 2 == 0 and state["own_verdict"] else state["verdict"]
        return {"results": [{"criterion_index": 0, "verdict": verdict, "quote": quote, "reason": "Supported by the quoted passage."}]}

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

    monkeypatch.setattr(sdk, "get_contract_at", lambda address: SimpleNamespace(view=lambda: View(), emit=lambda **kwargs: Emitter()))
    monkeypatch.setattr(sdk.nondet.web, "get", get)
    monkeypatch.setattr(sdk.nondet, "exec_prompt", prompt)
    monkeypatch.setattr(sdk.vm, "Return", Return)
    monkeypatch.setattr(sdk.vm, "run_nondet_unsafe", nondet)
    return contract, state, Address, direct_alice


def prepare(claims, direct_vm, passage=PASSAGE):
    contract, _, _, hunter = claims
    direct_vm.sender = hunter
    contract.prepare_claim("claim-1", "watch-1", "https://web.archive.org/web/" + NEW + "id_/" + URL, passage)
    direct_vm.sender = direct_vm._contract_address
    contract.finalize_preparation("claim-1", 1)
    direct_vm.sender = hunter


def finalize(contract, direct_vm, version=2):
    direct_vm.sender = direct_vm._contract_address
    contract.finalize_judgment("claim-1", version)


@pytest.mark.parametrize("passage", ["Old policy rights.", "Absent invented passage."])
def test_code_rejections_never_call_model_or_accept_bond(claims, direct_vm, passage):
    contract, state, _, _ = claims
    prepare(claims, direct_vm, passage)
    assert json.loads(contract.get_claim("claim-1"))["status"] == "CODE_REJECTED"
    assert state["model_calls"] == 0
    assert not any(method == "apply_claim_result" for method, _ in state["emitted"])


@pytest.mark.parametrize("verdict", ["TRIGGERED", "NOT_TRIGGERED", "UNCLEAR"])
def test_each_criterion_verdict_finalizes_and_notifies_escrow(claims, direct_vm, verdict):
    contract, state, _, _ = claims
    state["verdict"] = verdict
    prepare(claims, direct_vm)
    contract.judge_claim("claim-1")
    assert json.loads(contract.get_claim("claim-1"))["finalized"] is False
    finalize(contract, direct_vm)
    record = json.loads(contract.get_claim("claim-1"))
    assert record["status"] == verdict and record["finalized"] is True
    assert ("apply_claim_result", ("claim-1",)) in state["emitted"]
    assert (("record_rejected_claim", ("claim-1",)) in state["emitted"]) == (verdict == "NOT_TRIGGERED")


def test_validators_can_choose_different_quotes(claims, direct_vm):
    contract, state, _, _ = claims
    state["different_quotes"] = True
    prepare(claims, direct_vm)
    contract.judge_claim("claim-1")
    finalize(contract, direct_vm)
    assert json.loads(contract.get_claim("claim-1"))["status"] == "TRIGGERED"


def test_quote_missing_from_fetch_cannot_reach_agreement(claims, direct_vm):
    contract, state, _, _ = claims
    prepare(claims, direct_vm)
    state["bad_quote"] = True
    with direct_vm.expect_revert("validator disagreement"):
        contract.judge_claim("claim-1")


def test_different_verdicts_cannot_reach_agreement(claims, direct_vm):
    contract, state, _, _ = claims
    prepare(claims, direct_vm)
    state["own_verdict"] = "NOT_TRIGGERED"
    with direct_vm.expect_revert("validator disagreement"):
        contract.judge_claim("claim-1")


def test_actual_leader_text_is_hashed_during_preparation(claims, direct_vm):
    contract, state, _, hunter = claims
    state["tamper"] = lambda answer: answer.update(snapshot_text="forged policy")
    direct_vm.sender = hunter
    with direct_vm.expect_revert("validator disagreement"):
        contract.prepare_claim("claim-1", "watch-1", "https://web.archive.org/web/" + NEW + "id_/" + URL, PASSAGE)


def test_unfunded_claim_cannot_be_judged(claims, direct_vm):
    contract, state, _, _ = claims
    prepare(claims, direct_vm)
    state["bond"]["finalized"] = False
    with direct_vm.expect_revert("exact finalized hunter bond required"):
        contract.judge_claim("claim-1")


def test_timeout_voids_and_stale_callback_cannot_promote_new_version(claims, direct_vm):
    contract, state, _, _ = claims
    prepare(claims, direct_vm)
    contract.judge_claim("claim-1")
    direct_vm.warp("2026-11-14T00:30:00Z")
    contract.timeout_claim("claim-1")
    finalize(contract, direct_vm, 2)
    assert json.loads(contract.get_claim("claim-1"))["finalized"] is False
    finalize(contract, direct_vm, 3)
    record = json.loads(contract.get_claim("claim-1"))
    assert record["status"] == "VOID" and record["finalized"] is True
    assert ("apply_claim_result", ("claim-1",)) in state["emitted"]


def test_claim_id_and_active_watch_lock_prevent_double_claims(claims, direct_vm):
    contract, _, _, _ = claims
    prepare(claims, direct_vm)
    with direct_vm.expect_revert("new bounded claim ID required"):
        contract.prepare_claim("claim-1", "watch-1", "https://web.archive.org/web/" + NEW + "id_/" + URL, PASSAGE)
    with direct_vm.expect_revert("another claim is active"):
        contract.prepare_claim("claim-2", "watch-1", "https://web.archive.org/web/" + NEW + "id_/" + URL, PASSAGE)
