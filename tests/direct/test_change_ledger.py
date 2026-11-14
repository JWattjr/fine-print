import copy
import json
from types import SimpleNamespace

import pytest

WATCHES = "0x" + "22" * 20
CLAIMS = "0x" + "33" * 20
CHALLENGES = "0x" + "44" * 20
BOUNTIES = "0x" + "55" * 20
HUNTER = "0x" + "66" * 20
CHALLENGER = "0x" + "77" * 20


@pytest.fixture
def ledger(monkeypatch, direct_vm, direct_deploy, direct_alice):
    direct_vm.sender = direct_alice
    direct_vm._chain_id = 61999
    contract = direct_deploy("contracts/change_ledger.py")
    contract.configure(WATCHES, CLAIMS, CHALLENGES, BOUNTIES)
    import genlayer.gl as sdk
    from genlayer.py.types import Address

    records = {
        (WATCHES, "get_watch", "watch-1"): {
            "finalized": True, "criteria_hash": "frozen", "criteria": ["Allows AI training"],
            "url": "https://example.com/policy", "concern": "AI training rights",
            "historical_replay": True, "baseline_url": "https://web.archive.org/web/20230101000000id_/https://example.com/policy",
            "baseline_timestamp": "20230101000000",
        },
        (CLAIMS, "get_claim", "claim-1"): {
            "finalized": True, "status": "TRIGGERED", "voided": False,
            "watch_id": "watch-1", "criteria_hash": "frozen", "hunter": HUNTER,
            "passage": "We may train AI on your content.",
            "snapshot_url": "https://web.archive.org/web/20230901000000id_/https://example.com/policy",
            "snapshot_timestamp": "20230901000000",
            "results": [{"criterion_index": 0, "verdict": "TRIGGERED", "quote": "train AI on your content"}],
        },
        (BOUNTIES, "get_settlement", "claim-1"): {
            "finalized": True, "status": "PAID", "credit_verified": True,
            "claim_id": "claim-1", "recipient": HUNTER, "amount_wei": "5",
        },
        (CHALLENGES, "get_claim_summary", "claim-1"): {
            "finalized": True, "sealed": True, "pending": 0, "upheld": False,
        },
        (CHALLENGES, "get_challenge", "challenge-1"): {
            "finalized": True, "ruling": "UPHELD", "challenger": CHALLENGER, "hunter": HUNTER,
        },
    }

    class View:
        def __init__(self, address):
            self.address = str(address).lower()

        def __getattr__(self, method):
            return lambda key: json.dumps(records[(self.address, method, key)])

    monkeypatch.setattr(sdk, "get_contract_at", lambda address: SimpleNamespace(view=lambda: View(address)))
    return contract, records, Address


def test_ledger_requires_authorized_finality_callback(ledger, direct_vm, direct_alice):
    contract, _, _ = ledger
    direct_vm.sender = direct_alice
    with direct_vm.expect_revert("Bounties finality callback only"):
        contract.append_change("claim-1")


@pytest.mark.parametrize("peer,method,field,value", [
    (CLAIMS, "get_claim", "finalized", False),
    (CLAIMS, "get_claim", "status", "PENDING_FINALITY"),
    (CLAIMS, "get_claim", "voided", True),
    (BOUNTIES, "get_settlement", "finalized", False),
    (BOUNTIES, "get_settlement", "credit_verified", False),
    (BOUNTIES, "get_settlement", "status", "RESERVED"),
    (CHALLENGES, "get_claim_summary", "pending", 1),
    (CHALLENGES, "get_claim_summary", "sealed", False),
    (CHALLENGES, "get_claim_summary", "finalized", False),
    (CHALLENGES, "get_claim_summary", "upheld", True),
])
def test_ledger_rejects_unfinalized_or_unsettled_results(ledger, direct_vm, peer, method, field, value):
    contract, records, Address = ledger
    records[(peer, method, "claim-1")][field] = value
    direct_vm.sender = Address(BOUNTIES)
    with direct_vm.expect_revert():
        contract.append_change("claim-1")
    assert json.loads(contract.list_entries(0, 10))["total"] == 0


def test_ledger_entry_and_catch_counter_are_immutable_and_unique(ledger, direct_vm):
    contract, records, Address = ledger
    direct_vm.sender = Address(BOUNTIES)
    contract.append_change("claim-1")
    first = contract.get_entry("claim-1")
    records[(CLAIMS, "get_claim", "claim-1")]["passage"] = "Changed peer data"
    contract.append_change("claim-1")
    assert contract.get_entry("claim-1") == first
    assert json.loads(contract.list_entries(0, 10))["total"] == 1
    assert json.loads(contract.get_hunter(HUNTER))["confirmed_catches"] == 1


def test_missing_quote_cannot_enter_ledger(ledger, direct_vm):
    contract, records, Address = ledger
    records[(CLAIMS, "get_claim", "claim-1")]["results"][0]["quote"] = "invented quote"
    direct_vm.sender = Address(BOUNTIES)
    with direct_vm.expect_revert("invalid triggered evidence"):
        contract.append_change("claim-1")


def test_rejected_claim_counter_requires_finality_and_is_idempotent(ledger, direct_vm):
    contract, records, Address = ledger
    claim = records[(CLAIMS, "get_claim", "claim-1")]
    claim.update(status="NOT_TRIGGERED", finalized=False)
    direct_vm.sender = Address(CLAIMS)
    with direct_vm.expect_revert("finalized negative judgment required"):
        contract.record_rejected_claim("claim-1")
    claim["finalized"] = True
    contract.record_rejected_claim("claim-1")
    contract.record_rejected_claim("claim-1")
    assert json.loads(contract.get_hunter(HUNTER))["rejected_claims"] == 1


def test_challenge_winners_are_recorded_once_for_each_real_ruling(ledger, direct_vm):
    contract, records, Address = ledger
    direct_vm.sender = Address(CHALLENGES)
    contract.record_challenge_win("challenge-1")
    contract.record_challenge_win("challenge-1")
    rejected = copy.deepcopy(records[(CHALLENGES, "get_challenge", "challenge-1")])
    rejected["ruling"] = "REJECTED"
    records[(CHALLENGES, "get_challenge", "challenge-2")] = rejected
    contract.record_challenge_win("challenge-2")
    assert json.loads(contract.get_hunter(CHALLENGER))["challenges_won"] == 1
    assert json.loads(contract.get_hunter(HUNTER))["challenges_won"] == 1


def test_peers_cannot_be_reconfigured(ledger, direct_vm, direct_alice):
    contract, _, _ = ledger
    direct_vm.sender = direct_alice
    with direct_vm.expect_revert("owner configures peers once"):
        contract.configure(WATCHES, CLAIMS, CHALLENGES, BOUNTIES)
