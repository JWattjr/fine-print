import base64
import json
import sys
from types import SimpleNamespace

import pytest

WATCHES, CLAIMS, CHALLENGES, LEDGER = ["0x" + byte * 20 for byte in ("22", "33", "44", "55")]
PARENT, CHILD = "0x" + "aa" * 32, "0x" + "bb" * 32


@pytest.fixture
def bank(monkeypatch, direct_vm, direct_deploy, direct_alice):
    direct_vm.sender = direct_alice
    direct_vm._chain_id = 61999
    direct_vm.warp("2026-11-14T00:00:00Z")
    contract = direct_deploy("contracts/bounties.py")
    contract.configure(WATCHES, CLAIMS, CHALLENGES, LEDGER)
    import genlayer.gl as sdk
    from genlayer.py import calldata
    from genlayer.py.types import Address
    wallet, address = str(Address(direct_alice)).lower(), str(Address(direct_vm._contract_address)).lower()
    watch = {"finalized": True, "status": "COMPILED", "sponsor": wallet, "bounty_wei": "10", "bond_wei": "1", "challenge_bond_wei": "1", "funding_deadline": 1794618000, "expires_at": 1794621600}
    claim = {"id": "claim-1", "watch_id": "watch-1", "finalized": True, "status": "READY", "hunter": wallet, "prepare_deadline": 1794616200, "challenge_deadline": 1794614460, "voided": False}
    challenge = {"id": "challenge-1", "claim_id": "claim-1", "watch_id": "watch-1", "finalized": True, "status": "READY", "challenger": wallet, "hunter": wallet, "prepare_deadline": 1794616200, "ruling": "UPHELD"}
    summary = {"finalized": True, "sealed": True, "pending": 0, "upheld": False}
    state = {"watch": watch, "claim": claim, "challenge": challenge, "summary": summary, "active": {}, "emitted": [], "transfers": [], "receipts": {}, "wallet": wallet, "address": address, "calldata": calldata, "Address": Address}

    class View:
        def __getattr__(self, method):
            return lambda key: json.dumps({"get_watch": watch, "get_claim": claim, "get_challenge": challenge, "get_claim_summary": summary, "get_active_claim": state["active"]}[method])

    class Emitter:
        def __getattr__(self, method):
            return lambda *args: state["emitted"].append((method, args))

    def post(url, body, **kwargs):
        tx_hash = json.loads(body)["params"][0]
        return SimpleNamespace(status=200, body=json.dumps({"result": state["receipts"][tx_hash]}).encode())

    def transfer(recipient, **kwargs):
        amount = int(kwargs["value"])
        state["transfers"].append((str(recipient).lower(), amount, kwargs["on"]))
        current = direct_vm._balances.get(direct_vm._contract_address, 0)
        direct_vm.deal(direct_vm._contract_address, current - amount)

    module = sys.modules[type(contract._instance).__module__]
    monkeypatch.setattr(module, "Recipient", lambda recipient: SimpleNamespace(emit_transfer=lambda **kwargs: transfer(recipient, **kwargs)))
    monkeypatch.setattr(sdk, "get_contract_at", lambda address: SimpleNamespace(view=lambda: View(), emit=lambda **kwargs: Emitter()))
    monkeypatch.setattr(sdk.nondet.web, "post", post)
    monkeypatch.setattr(sdk.eq_principle, "strict_eq", lambda run: run())
    return contract, state, direct_alice


def self_call(contract, direct_vm, method, *args):
    direct_vm.sender = direct_vm._contract_address
    getattr(contract, method)(*args)


def fund(bank, direct_vm, kind="WATCH", record="watch-1", ticket="ticket-1", deposit="deposit-1", amount=10):
    contract, state, wallet = bank
    direct_vm.sender = wallet
    direct_vm.value = 0
    contract.prepare_deposit(ticket, kind, record)
    self_call(contract, direct_vm, "finalize_ticket", ticket)
    direct_vm.sender = wallet
    direct_vm.value = amount
    contract.deposit(deposit, ticket)
    direct_vm.value = 0
    direct_vm.deal(direct_vm._contract_address, int(json.loads(contract.get_accounting())["unpaid_liability_wei"]))
    self_call(contract, direct_vm, "finalize_deposit", deposit)
    direct_vm.sender = wallet


def funded_claim(bank, direct_vm):
    contract, state, _ = bank
    fund(bank, direct_vm)
    state["watch"]["status"] = "OPEN"
    fund(bank, direct_vm, "CLAIM", "claim-1", "ticket-2", "deposit-2", 1)


def settled(bank, direct_vm):
    contract, state, _ = bank
    funded_claim(bank, direct_vm)
    state["claim"]["status"] = "TRIGGERED"
    direct_vm.warp("2026-11-14T00:01:00Z")
    contract.settle("claim-1")
    self_call(contract, direct_vm, "finalize_credit", "bounty:claim-1")


def transfer_receipts(state, credit="bounty:claim-1", amount=10, attempt=1, paid=True):
    encoded = base64.b64encode(state["calldata"].encode({"method": "claim", "args": [credit, attempt]})).decode()
    state["receipts"][PARENT] = {"hash": PARENT, "status": "FINALIZED", "result": 6, "result_name": None,
        "from_address": state["wallet"], "to_address": state["address"], "data": {"calldata": encoded},
        "triggered_transactions": [CHILD], "consensus_data": {"leader_receipt": [{"vote": None, "execution_result": "SUCCESS"}]}}
    state["receipts"][CHILD] = {"hash": CHILD, "status": "FINALIZED", "from_address": state["address"], "to_address": state["wallet"], "value": amount, "triggered_by": PARENT, "value_credited": paid}


def test_only_finalized_ticket_can_allocate_value(bank, direct_vm):
    contract, state, wallet = bank
    contract.prepare_deposit("ticket-1", "WATCH", "watch-1")
    direct_vm.value = 10
    contract.deposit("deposit-1", "ticket-1")
    direct_vm.value = 0
    assert json.loads(contract.get_deposit("deposit-1"))["valid_ticket"] is False
    assert json.loads(contract.get_watch_escrow("watch-1")) == {}
    self_call(contract, direct_vm, "finalize_deposit", "deposit-1")
    self_call(contract, direct_vm, "finalize_credit", "deposit-refund:deposit-1")
    assert json.loads(contract.get_credit("deposit-refund:deposit-1"))["amount_wei"] == "10"


def test_wrong_amount_becomes_refund_and_preserves_ticket(bank, direct_vm):
    contract, state, wallet = bank
    contract.prepare_deposit("ticket-1", "WATCH", "watch-1")
    self_call(contract, direct_vm, "finalize_ticket", "ticket-1")
    direct_vm.sender, direct_vm.value = wallet, 9
    contract.deposit("deposit-1", "ticket-1")
    direct_vm.value = 0
    self_call(contract, direct_vm, "finalize_deposit", "deposit-1")
    assert json.loads(contract.get_credit("deposit-refund:deposit-1"))["amount_wei"] == "9"
    assert json.loads(contract.get_ticket("ticket-1"))["status"] == "READY"


def test_ticket_deadline_releases_reserved_budget_and_old_callback_is_harmless(bank, direct_vm):
    contract, _, _ = bank
    contract.prepare_deposit("ticket-1", "WATCH", "watch-1")
    direct_vm.warp("2026-11-14T00:10:00Z")
    contract.expire_ticket("ticket-1")
    self_call(contract, direct_vm, "finalize_ticket", "ticket-1")
    assert json.loads(contract.get_ticket("ticket-1"))["status"] == "EXPIRED"
    assert json.loads(contract.get_accounting())["prepared_wei"] == "0"


def test_cross_kind_bond_ticket_cannot_overwrite_another_reservation(bank, direct_vm):
    contract, _, _ = bank
    contract.prepare_deposit("ticket-1", "CLAIM", "same-id")
    with direct_vm.expect_revert("bond record ID already has a reserved ticket"):
        contract.prepare_deposit("ticket-2", "CHALLENGE", "same-id")


def test_valid_funding_tracks_pending_state_then_notifies_watch(bank, direct_vm):
    contract, state, _ = bank
    fund(bank, direct_vm)
    assert json.loads(contract.get_watch_escrow("watch-1"))["status"] == "FUNDED"
    assert ("mark_funded", ("watch-1",)) in state["emitted"]
    assert json.loads(contract.get_accounting())["unpaid_liability_wei"] == "10"


def test_negative_claim_forfeits_bond_to_watch_exactly_once(bank, direct_vm):
    contract, state, _ = bank
    funded_claim(bank, direct_vm)
    state["claim"]["status"] = "NOT_TRIGGERED"
    direct_vm.sender = state["Address"](CLAIMS)
    contract.apply_claim_result("claim-1")
    contract.apply_claim_result("claim-1")
    assert json.loads(contract.get_watch_escrow("watch-1"))["amount_wei"] == "11"
    assert json.loads(contract.get_bond("claim-1"))["status"] == "FORFEITED"
    assert json.loads(contract.get_accounting())["unpaid_liability_wei"] == "11"


@pytest.mark.parametrize("status", ["UNCLEAR", "VOID"])
def test_void_or_unclear_claim_refunds_bond(bank, direct_vm, status):
    contract, state, _ = bank
    funded_claim(bank, direct_vm)
    state["claim"]["status"] = status
    direct_vm.sender = state["Address"](CLAIMS)
    contract.apply_claim_result("claim-1")
    assert json.loads(contract.get_credit("claim-refund:claim-1"))["amount_wei"] == "1"
    assert json.loads(contract.get_watch_escrow("watch-1"))["amount_wei"] == "10"


@pytest.mark.parametrize("ruling,amount", [("UPHELD", "2"), ("REJECTED", "1"), ("VOID", "1")])
def test_challenge_bonds_follow_finalized_ruling_once(bank, direct_vm, ruling, amount):
    contract, state, _ = bank
    funded_claim(bank, direct_vm)
    fund(bank, direct_vm, "CHALLENGE", "challenge-1", "ticket-3", "deposit-3", 1)
    state["challenge"].update(status="RESOLVED", ruling=ruling)
    direct_vm.sender = state["Address"](CHALLENGES)
    contract.apply_challenge_result("challenge-1")
    contract.apply_challenge_result("challenge-1")
    assert json.loads(contract.get_credit("challenge-award:challenge-1"))["amount_wei"] == amount
    assert json.loads(contract.get_bond("claim-1"))["status"] == ("AWARDED" if ruling == "UPHELD" else "FUNDED")


def test_settlement_requires_final_challenge_closure(bank, direct_vm):
    contract, state, _ = bank
    funded_claim(bank, direct_vm)
    state["claim"]["status"] = "TRIGGERED"
    direct_vm.warp("2026-11-14T00:01:00Z")
    state["summary"]["pending"] = 1
    with direct_vm.expect_revert("finalized challenge closure required"):
        contract.settle("claim-1")


def test_paid_native_child_requires_parent_binding_and_finality_before_ledger(bank, direct_vm):
    contract, state, wallet = bank
    settled(bank, direct_vm)
    direct_vm.sender = wallet
    contract.claim("bounty:claim-1", 1)
    assert state["transfers"] == [(state["wallet"], 10, "finalized")]
    transfer_receipts(state)
    contract.verify_claim("bounty:claim-1", 1, PARENT, CHILD)
    assert json.loads(contract.get_settlement("claim-1"))["credit_verified"] is False
    assert not any(method == "append_change" for method, _ in state["emitted"])
    self_call(contract, direct_vm, "finalize_verification", "bounty:claim-1", 1)
    self_call(contract, direct_vm, "finalize_verification", "bounty:claim-1", 1)
    assert json.loads(contract.get_settlement("claim-1"))["status"] == "PAID"
    assert json.loads(contract.get_accounting())["unpaid_liability_wei"] == "1"
    assert state["emitted"].count(("append_change", ("claim-1",))) == 1


@pytest.mark.parametrize("mutation", ["pending", "wrong_child", "wrong_amount", "wrong_attempt"])
def test_unrelated_or_unfinalized_transfer_is_not_credit_proof(bank, direct_vm, mutation):
    contract, state, wallet = bank
    settled(bank, direct_vm)
    direct_vm.sender = wallet
    contract.claim("bounty:claim-1", 1)
    transfer_receipts(state)
    if mutation == "pending":
        state["receipts"][CHILD]["status"] = "ACCEPTED"
    elif mutation == "wrong_child":
        state["receipts"][CHILD]["triggered_by"] = "0x" + "cc" * 32
    elif mutation == "wrong_amount":
        state["receipts"][CHILD]["value"] = 11
    else:
        transfer_receipts(state, attempt=2)
    with direct_vm.expect_revert():
        contract.verify_claim("bounty:claim-1", 1, PARENT, CHILD)
    assert json.loads(contract.get_credit("bounty:claim-1"))["status"] == "TRANSFER_PENDING"


def test_failed_native_credit_restores_pull_only_after_final_proof_and_returned_value(bank, direct_vm):
    contract, state, wallet = bank
    settled(bank, direct_vm)
    direct_vm.sender = wallet
    contract.claim("bounty:claim-1", 1)
    transfer_receipts(state, paid=False)
    contract.verify_claim("bounty:claim-1", 1, PARENT, CHILD)
    self_call(contract, direct_vm, "finalize_verification", "bounty:claim-1", 1)
    direct_vm.sender = wallet
    with direct_vm.expect_revert("reserved native value"):
        contract.claim("bounty:claim-1", 2)
    direct_vm.deal(direct_vm._contract_address, 11)
    contract.claim("bounty:claim-1", 2)
    assert json.loads(contract.get_accounting())["total_paid_wei"] == "0"


def test_failed_payable_value_is_recoverable_once_but_successful_deposit_is_not(bank, direct_vm):
    contract, state, _ = bank
    state["receipts"][PARENT] = {"hash": PARENT, "status": "FINALIZED", "result": 6, "from_address": state["wallet"], "to_address": state["address"], "value": 7, "value_credited": True, "consensus_data": {"leader_receipt": [{"vote": None, "execution_result": "ERROR"}]}}
    direct_vm.deal(direct_vm._contract_address, 7)
    contract.recover_failed_deposit(PARENT)
    assert json.loads(contract.get_credit("failed-refund:" + PARENT))["amount_wei"] == "7"
    with direct_vm.expect_revert("already recovered"):
        contract.recover_failed_deposit(PARENT)
    state["receipts"][CHILD] = dict(state["receipts"][PARENT], hash=CHILD, consensus_data={"leader_receipt": [{"vote": None, "execution_result": "SUCCESS"}]})
    with direct_vm.expect_revert("failed execution or consensus"):
        contract.recover_failed_deposit(CHILD)


def test_credited_consensus_failure_is_refundable_without_committed_deposit_state(bank, direct_vm):
    contract, state, _ = bank
    state["receipts"][PARENT] = {"hash": PARENT, "status": "FINALIZED", "result": 5, "from_address": state["wallet"], "to_address": state["address"], "value": 4, "value_credited": True, "consensus_data": {"leader_receipt": [{"vote": None, "execution_result": "SUCCESS"}]}}
    direct_vm.deal(direct_vm._contract_address, 4)
    contract.recover_failed_deposit(PARENT)
    assert json.loads(contract.get_credit("failed-refund:" + PARENT))["amount_wei"] == "4"


def test_late_bond_funding_can_be_reconciled_against_final_timeout(bank, direct_vm):
    contract, state, _ = bank
    funded_claim(bank, direct_vm)
    state["claim"]["status"] = "VOID"
    contract.reconcile_bond("claim-1")
    contract.reconcile_bond("claim-1")
    assert json.loads(contract.get_credit("claim-refund:claim-1"))["amount_wei"] == "1"
    assert json.loads(contract.get_bond("claim-1"))["status"] == "ALLOCATED"


def test_expired_watch_and_unclaimed_bounty_refund_sponsor(bank, direct_vm):
    contract, state, _ = bank
    fund(bank, direct_vm)
    direct_vm.warp("2026-11-14T02:00:00Z")
    contract.refund_watch("watch-1")
    assert json.loads(contract.get_credit("watch-refund:watch-1"))["owner"] == state["wallet"]
    assert json.loads(contract.get_watch_escrow("watch-1"))["amount_wei"] == "0"


def test_callback_permissions_and_budget_cap(bank, direct_vm):
    contract, state, _ = bank
    with direct_vm.expect_revert("self finality callback only"):
        contract.finalize_ticket("not-a-ticket")
    state["watch"]["bounty_wei"] = str(10**17 + 1)
    with direct_vm.expect_revert("deposit budget exhausted"):
        contract.prepare_deposit("ticket-1", "WATCH", "watch-1")
