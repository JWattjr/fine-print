# { "Depends": "py-genlayer:1jb45aa8ynh2a9c9xn3b7qqh8sm5q93hwfp7jqmwsfhh8jpz09h6" }
"""Deterministic escrow, refundable deposit tickets and receipt-verified native pulls."""
import base64
import json
import re
from datetime import datetime
from genlayer import *
from genlayer.py import calldata

CAP = 10**17


def require(ok, message):
    if not ok:
        raise gl.vm.UserError("[EXPECTED] " + message)


def now():
    return int(datetime.fromisoformat(str(gl.message_raw["datetime"]).replace("Z", "+00:00")).timestamp())


def peer(address, method, key):
    return json.loads(getattr(gl.get_contract_at(address).view(), method)(key))


def receipt(tx_hash):
    require(re.fullmatch(r"0x[0-9a-fA-F]{64}", tx_hash) is not None, "transaction hash required")
    response = gl.nondet.web.post("https://studio.genlayer.com/api", body=json.dumps({"jsonrpc": "2.0", "id": 1, "method": "eth_getTransactionByHash", "params": [tx_hash]}).encode(), headers={"Content-Type": "application/json", "User-Agent": "Mozilla/5.0 FinePrint/1.0"})
    require(response.status == 200, "receipt RPC unavailable")
    payload = json.loads(response.body.decode("utf-8"))
    require(not payload.get("error") and isinstance(payload.get("result"), dict), "receipt unavailable")
    result = payload["result"]
    require(str(result.get("hash", tx_hash)).lower() == tx_hash.lower() and (result.get("status_name") or result.get("status")) == "FINALIZED", "matching finalized receipt required")
    return result


def execution(result):
    leaders = result.get("consensus_data", {}).get("leader_receipt", [])
    leaders = [leader for leader in leaders if not leader.get("vote")]
    raw = leaders[-1].get("execution_result") if leaders else result.get("tx_execution_result", result.get("txExecutionResult"))
    return str(raw).upper()


def agreed(result):
    return (result.get("result_name") or result.get("result")) in (1, 6, "AGREE", "MAJORITY_AGREE")


def failed(result):
    outcome = result.get("result_name") or result.get("result")
    return execution(result) in ("ERROR", "FINISHED_WITH_ERROR", "2") or outcome in (2, 3, 4, 5, 7, "DISAGREE", "TIMEOUT", "DETERMINISTIC_VIOLATION", "NO_MAJORITY", "MAJORITY_DISAGREE")


def decoded_call(result):
    encoded = result.get("data", {}).get("calldata")
    if isinstance(encoded, dict):
        return encoded
    require(isinstance(encoded, str), "parent calldata unavailable")
    return calldata.decode(base64.b64decode(encoded))


@gl.evm.contract_interface
class Recipient:
    class View:
        pass
    class Write:
        pass


class Bounties(gl.Contract):
    owner: Address
    configured: bool
    watches: Address
    claims: Address
    challenges: Address
    ledger: Address
    tickets: TreeMap[str, str]
    slots: TreeMap[str, str]
    deposits: TreeMap[str, str]
    deposit_order: DynArray[str]
    escrows: TreeMap[str, str]
    bonds: TreeMap[str, str]
    credits: TreeMap[str, str]
    credit_order: DynArray[str]
    settlements: TreeMap[str, str]
    recovered: TreeMap[str, bool]
    total_deposited: u256
    prepared_wei: u256
    liability: u256
    total_paid: u256
    inflight: str
    bond_slots: TreeMap[str, str]

    def __init__(self):
        require(int(gl.message.chain_id) == 61999, "StudioNet only")
        self.owner = gl.message.sender_address
        self.configured = False
        self.inflight = ""

    @gl.public.write
    def configure(self, watches: str, claims: str, challenges: str, ledger: str) -> None:
        require(gl.message.sender_address == self.owner and not self.configured, "owner configures peers once")
        addresses = [Address(watches), Address(claims), Address(challenges), Address(ledger)]
        require(len(set(str(address).lower() for address in addresses)) == 4 and all(address != gl.message.contract_address and str(address).lower() != "0x" + "0" * 40 for address in addresses), "distinct nonzero peers required")
        self.watches, self.claims, self.challenges, self.ledger = addresses
        self.configured = True

    @gl.public.write
    def prepare_deposit(self, ticket_id: str, kind: str, record_id: str) -> None:
        require(self.configured and re.fullmatch(r"[a-zA-Z0-9_-]{1,64}", ticket_id) is not None and ticket_id not in self.tickets, "new bounded deposit ticket required")
        require(kind in ("WATCH", "CLAIM", "CHALLENGE"), "supported deposit purpose required")
        slot = kind + ":" + record_id
        previous_id = self.slots.get(slot, "")
        if previous_id:
            require(json.loads(self.tickets[previous_id])["status"] == "EXPIRED", "deposit ticket already reserved or consumed")
        wallet = str(gl.message.sender_address).lower()
        if kind == "WATCH":
            watch = peer(self.watches, "get_watch", record_id)
            require(watch.get("finalized") is True and watch.get("status") == "COMPILED" and watch.get("sponsor") == wallet and now() < watch["funding_deadline"], "sponsor needs a finalized unexpired compilation")
            require(record_id not in self.escrows, "watch already funded")
            amount, deadline = int(watch["bounty_wei"]), watch["funding_deadline"]
        else:
            source, method = (self.claims, "get_claim") if kind == "CLAIM" else (self.challenges, "get_challenge")
            record = peer(source, method, record_id)
            field = "hunter" if kind == "CLAIM" else "challenger"
            require(record.get("finalized") is True and record.get("status") == "READY" and record.get(field) == wallet and now() < record["prepare_deadline"], "owner needs finalized prepared evidence")
            require(record_id not in self.bonds, "bond record ID is already in use")
            bond_ticket = self.bond_slots.get(record_id, "")
            require(not bond_ticket or json.loads(self.tickets[bond_ticket])["status"] == "EXPIRED", "bond record ID already has a reserved ticket")
            watch = peer(self.watches, "get_watch", record["watch_id"])
            amount, deadline = int(watch["bond_wei"] if kind == "CLAIM" else watch["challenge_bond_wei"]), record["prepare_deadline"]
        require(0 < amount and int(self.total_deposited) + int(self.prepared_wei) + amount <= CAP, "project deposit budget exhausted")
        ticket = {"id": ticket_id, "kind": kind, "record_id": record_id, "owner": wallet, "amount_wei": str(amount), "expires_at": min(now() + 600, deadline), "status": "PENDING_FINALITY", "finalized": False}
        self.tickets[ticket_id] = json.dumps(ticket)
        self.slots[slot] = ticket_id
        if kind != "WATCH":
            self.bond_slots[record_id] = ticket_id
        self.prepared_wei = u256(int(self.prepared_wei) + amount)
        gl.get_contract_at(gl.message.contract_address).emit(on="finalized").finalize_ticket(ticket_id)

    @gl.public.write
    def finalize_ticket(self, ticket_id: str) -> None:
        require(gl.message.sender_address == gl.message.contract_address, "self finality callback only")
        ticket = json.loads(self.tickets[ticket_id])
        if ticket["status"] != "PENDING_FINALITY":
            return
        ticket.update(status="READY", finalized=True)
        self.tickets[ticket_id] = json.dumps(ticket)

    @gl.public.write
    def expire_ticket(self, ticket_id: str) -> None:
        ticket = json.loads(self.tickets[ticket_id])
        require(ticket["status"] in ("READY", "PENDING_FINALITY") and now() >= ticket["expires_at"], "unused ticket deadline not reached")
        ticket.update(status="EXPIRED", finalized=True)
        self.prepared_wei = u256(int(self.prepared_wei) - int(ticket["amount_wei"]))
        self.tickets[ticket_id] = json.dumps(ticket)

    @gl.public.write.payable
    def deposit(self, deposit_id: str, ticket_id: str) -> None:
        # A failure before state commits remains refundable through its finalized
        # failed receipt. Known ticket mistakes instead record a refund normally.
        require(re.fullmatch(r"[a-zA-Z0-9_-]{1,64}", deposit_id) is not None and deposit_id not in self.deposits, "new bounded deposit ID required; failed credited calls can be recovered")
        amount, wallet = int(gl.message.value), str(gl.message.sender_address).lower()
        require(amount > 0, "positive native deposit required")
        raw = self.tickets.get(ticket_id, "") if len(ticket_id) <= 64 else ""
        ticket = json.loads(raw) if raw else {}
        valid = ticket.get("status") == "READY" and ticket.get("finalized") is True and ticket.get("owner") == wallet and int(ticket.get("amount_wei", "0")) == amount and now() < ticket.get("expires_at", 0)
        if valid:
            ticket.update(status="CONSUMING", deposit_id=deposit_id)
            self.tickets[ticket_id] = json.dumps(ticket)
            self.prepared_wei = u256(int(self.prepared_wei) - amount)
            pending = {"id": ticket["record_id"], "owner": wallet, "amount_wei": str(amount), "kind": ticket["kind"], "status": "PENDING_FINALITY", "finalized": False, "deposit_id": deposit_id}
            if ticket["kind"] == "WATCH":
                self.escrows[ticket["record_id"]] = json.dumps(pending)
            else:
                self.bonds[ticket["record_id"]] = json.dumps(pending)
        record = {"id": deposit_id, "ticket_id": ticket_id[:64], "owner": wallet, "amount_wei": str(amount), "valid_ticket": valid, "created_at": now(), "resolve_deadline": now() + 1800, "status": "PENDING_FINALITY", "finalized": False}
        self.deposits[deposit_id] = json.dumps(record)
        self.deposit_order.append(deposit_id)
        self.total_deposited = u256(int(self.total_deposited) + amount)
        self.liability = u256(int(self.liability) + amount)
        gl.get_contract_at(gl.message.contract_address).emit(on="finalized").finalize_deposit(deposit_id)

    def _credit(self, key, owner, amount, purpose, claim_id="", refund_owner=""):
        if amount == 0:
            return
        if key in self.credits:
            existing = json.loads(self.credits[key])
            require(existing["owner"] == owner and existing["amount_wei"] == str(amount), "credit identity collision")
            return
        record = {"id": key, "owner": owner, "amount_wei": str(amount), "purpose": purpose, "claim_id": claim_id, "refund_owner": refund_owner, "status": "PENDING_FINALITY", "finalized": False, "attempt": 0, "created_at": now(), "claim_deadline": now() + 7 * 86400}
        self.credits[key] = json.dumps(record)
        self.credit_order.append(key)
        gl.get_contract_at(gl.message.contract_address).emit(on="finalized").finalize_credit(key)

    @gl.public.write
    def finalize_credit(self, credit_id: str) -> None:
        require(gl.message.sender_address == gl.message.contract_address, "self finality callback only")
        credit = json.loads(self.credits[credit_id])
        if credit["status"] == "PENDING_FINALITY":
            credit.update(status="AVAILABLE", finalized=True)
            self.credits[credit_id] = json.dumps(credit)

    @gl.public.write
    def resume_credit(self, credit_id: str) -> None:
        credit = json.loads(self.credits[credit_id])
        require(credit["status"] == "PENDING_FINALITY" and now() >= credit["created_at"] + 1800, "credit callback resolution deadline not reached")
        gl.get_contract_at(gl.message.contract_address).emit(on="finalized").finalize_credit(credit_id)

    @gl.public.write
    def finalize_deposit(self, deposit_id: str) -> None:
        require(gl.message.sender_address == gl.message.contract_address, "self finality callback only")
        record = json.loads(self.deposits[deposit_id])
        if record["status"] != "PENDING_FINALITY":
            return
        if record["valid_ticket"]:
            ticket = json.loads(self.tickets[record["ticket_id"]])
            require(ticket["status"] == "CONSUMING" and ticket["deposit_id"] == deposit_id, "deposit ticket binding mismatch")
            ticket.update(status="CONSUMED", finalized=True)
            self.tickets[record["ticket_id"]] = json.dumps(ticket)
            allocation = {"id": ticket["record_id"], "owner": record["owner"], "amount_wei": record["amount_wei"], "kind": ticket["kind"], "status": "FUNDED", "finalized": True, "deposit_id": deposit_id}
            if ticket["kind"] == "WATCH":
                self.escrows[ticket["record_id"]] = json.dumps(allocation)
                gl.get_contract_at(self.watches).emit(on="finalized").mark_funded(ticket["record_id"])
            else:
                self.bonds[ticket["record_id"]] = json.dumps(allocation)
        else:
            self._credit("deposit-refund:" + deposit_id, record["owner"], int(record["amount_wei"]), "REFUND")
        record.update(status="ALLOCATED" if record["valid_ticket"] else "REFUNDABLE", finalized=True)
        self.deposits[deposit_id] = json.dumps(record)

    @gl.public.write
    def resume_deposit(self, deposit_id: str, tx_hash: str) -> None:
        record = json.loads(self.deposits[deposit_id])
        require(record["status"] == "PENDING_FINALITY" and now() >= record["resolve_deadline"], "pending deposit resolution deadline not reached")
        contract = str(gl.message.contract_address).lower()
        def verify():
            parent = receipt(tx_hash)
            require(agreed(parent) and execution(parent) in ("SUCCESS", "FINISHED_WITH_RETURN", "1"), "successful deposit execution required")
            require(str(parent.get("from_address", "")).lower() == record["owner"] and str(parent.get("to_address", "")).lower() == contract and int(parent.get("value", 0)) == int(record["amount_wei"]) and parent.get("value_credited") is True, "credited deposit identity mismatch")
            call = decoded_call(parent)
            require(call.get("method") == "deposit" and list(call.get("args", [])) == [deposit_id, record["ticket_id"]], "receipt is not this deposit")
            return True
        require(gl.eq_principle.strict_eq(verify), "deposit proof required")
        gl.get_contract_at(gl.message.contract_address).emit(on="finalized").finalize_deposit(deposit_id)

    @gl.public.write
    def recover_failed_deposit(self, tx_hash: str) -> None:
        require(not self.recovered.get(tx_hash.lower(), False), "failed deposit already recovered")
        wallet, contract = str(gl.message.sender_address).lower(), str(gl.message.contract_address).lower()
        def verify():
            parent = receipt(tx_hash)
            require(failed(parent), "finalized failed execution or consensus required")
            require(str(parent.get("from_address", "")).lower() == wallet and str(parent.get("to_address", "")).lower() == contract and parent.get("value_credited") is True, "failed value was not credited from this owner")
            amount = int(parent.get("value", 0))
            require(amount > 0, "positive credited value required")
            return amount
        amount = gl.eq_principle.strict_eq(verify)
        require(int(self.balance) >= int(self.liability) + amount, "wait for unaccounted credited value to be available")
        self.recovered[tx_hash.lower()] = True
        self.total_deposited = u256(int(self.total_deposited) + amount)
        self.liability = u256(int(self.liability) + amount)
        self._credit("failed-refund:" + tx_hash.lower(), wallet, amount, "REFUND")

    @gl.public.write
    def apply_claim_result(self, claim_id: str) -> None:
        require(self.configured and gl.message.sender_address == self.claims, "Claims finality callback only")
        self._apply_claim_result(claim_id)

    def _apply_claim_result(self, claim_id):
        claim = peer(self.claims, "get_claim", claim_id)
        require(claim.get("finalized") is True and claim.get("status") in ("TRIGGERED", "NOT_TRIGGERED", "UNCLEAR", "VOID"), "finalized claim result required")
        raw = self.bonds.get(claim_id, "")
        if not raw:
            return
        bond = json.loads(raw)
        require(bond["kind"] == "CLAIM" and bond["owner"] == claim["hunter"], "claim bond identity mismatch")
        if bond["status"] != "FUNDED" or claim["status"] == "TRIGGERED":
            return
        if claim["status"] == "NOT_TRIGGERED":
            escrow = json.loads(self.escrows[claim["watch_id"]])
            require(escrow["status"] == "FUNDED", "open watch escrow required")
            escrow["amount_wei"] = str(int(escrow["amount_wei"]) + int(bond["amount_wei"]))
            self.escrows[claim["watch_id"]] = json.dumps(escrow)
            bond["status"] = "FORFEITED"
        else:
            self._credit("claim-refund:" + claim_id, bond["owner"], int(bond["amount_wei"]), "REFUND")
            bond["status"] = "ALLOCATED"
        self.bonds[claim_id] = json.dumps(bond)

    @gl.public.write
    def apply_challenge_result(self, challenge_id: str) -> None:
        require(self.configured and gl.message.sender_address == self.challenges, "Challenges finality callback only")
        self._apply_challenge_result(challenge_id)

    def _apply_challenge_result(self, challenge_id):
        challenge = peer(self.challenges, "get_challenge", challenge_id)
        require(challenge.get("finalized") is True and challenge.get("status") == "RESOLVED" and challenge.get("ruling") in ("UPHELD", "REJECTED", "VOID"), "finalized challenge ruling required")
        raw = self.bonds.get(challenge_id, "")
        if not raw:
            return
        bond = json.loads(raw)
        require(bond["kind"] == "CHALLENGE" and bond["owner"] == challenge["challenger"], "challenge bond identity mismatch")
        if bond["status"] != "FUNDED":
            return
        amount = int(bond["amount_wei"])
        owner = challenge["hunter"] if challenge["ruling"] == "REJECTED" else challenge["challenger"]
        if challenge["ruling"] == "UPHELD":
            hunter = json.loads(self.bonds.get(challenge["claim_id"], "{}"))
            require(hunter.get("kind") == "CLAIM" and hunter.get("owner") == challenge["hunter"], "hunter bond identity mismatch")
            if hunter["status"] == "FUNDED":
                amount += int(hunter["amount_wei"])
                hunter["status"] = "AWARDED"
                self.bonds[challenge["claim_id"]] = json.dumps(hunter)
        self._credit("challenge-award:" + challenge_id, owner, amount, "REFUND" if challenge["ruling"] == "VOID" else "CHALLENGE_AWARD")
        bond["status"] = "ALLOCATED"
        self.bonds[challenge_id] = json.dumps(bond)

    @gl.public.write
    def reconcile_bond(self, record_id: str) -> None:
        require(self.configured and record_id in self.bonds, "funded bond record required")
        bond = json.loads(self.bonds[record_id])
        require(bond["status"] in ("FUNDED", "FORFEITED", "ALLOCATED", "AWARDED"), "wait for bond funding finality")
        if bond["status"] != "FUNDED":
            return
        if bond["kind"] == "CLAIM":
            self._apply_claim_result(record_id)
        else:
            self._apply_challenge_result(record_id)

    @gl.public.write
    def settle(self, claim_id: str) -> None:
        claim = peer(self.claims, "get_claim", claim_id)
        require(claim.get("finalized") is True and claim.get("status") == "TRIGGERED" and not claim.get("voided") and now() >= claim["challenge_deadline"], "finalized unchallenged catch after the window required")
        summary = peer(self.challenges, "get_claim_summary", claim_id)
        require(summary.get("finalized") is True and summary.get("sealed") is True and summary.get("pending") == 0 and summary.get("upheld") is False, "finalized challenge closure required")
        require(claim_id not in self.settlements, "claim settlement already reserved")
        escrow = json.loads(self.escrows[claim["watch_id"]])
        require(escrow["status"] == "FUNDED" and escrow["finalized"], "funded watch escrow required")
        bond = json.loads(self.bonds[claim_id])
        require(bond["status"] == "FUNDED" and bond["kind"] == "CLAIM" and bond["owner"] == claim["hunter"], "unspent hunter bond required")
        amount = int(escrow["amount_wei"])
        self._credit("bounty:" + claim_id, claim["hunter"], amount, "BOUNTY", claim_id, escrow["owner"])
        self._credit("hunter-bond:" + claim_id, claim["hunter"], int(bond["amount_wei"]), "REFUND")
        escrow.update(status="ALLOCATED", allocated_wei=str(amount), amount_wei="0")
        bond["status"] = "ALLOCATED"
        self.escrows[claim["watch_id"]], self.bonds[claim_id] = json.dumps(escrow), json.dumps(bond)
        self.settlements[claim_id] = json.dumps({"claim_id": claim_id, "watch_id": claim["watch_id"], "recipient": claim["hunter"], "amount_wei": str(amount), "credit_id": "bounty:" + claim_id, "status": "AWAITING_PULL", "credit_verified": False, "finalized": False})
        gl.get_contract_at(self.watches).emit(on="finalized").close_watch(claim["watch_id"])

    @gl.public.write
    def refund_watch(self, watch_id: str) -> None:
        watch = peer(self.watches, "get_watch", watch_id)
        require(now() >= watch["expires_at"], "watch expiry not reached")
        escrow = json.loads(self.escrows[watch_id])
        require(escrow["status"] == "FUNDED" and escrow["finalized"], "unallocated funded watch required")
        claim = peer(self.claims, "get_active_claim", watch_id)
        if claim:
            summary = peer(self.challenges, "get_claim_summary", claim["id"])
            require((claim.get("finalized") is True and claim.get("status") in ("CODE_REJECTED", "NOT_TRIGGERED", "UNCLEAR", "VOID")) or summary.get("upheld") is True, "resolve pending claim or settle a valid catch first")
        self._credit("watch-refund:" + watch_id, escrow["owner"], int(escrow["amount_wei"]), "REFUND")
        escrow.update(status="REFUNDED", refunded_wei=escrow["amount_wei"], amount_wei="0")
        self.escrows[watch_id] = json.dumps(escrow)
        gl.get_contract_at(self.watches).emit(on="finalized").close_watch(watch_id)

    @gl.public.write
    def claim(self, credit_id: str, attempt: int) -> None:
        credit = json.loads(self.credits[credit_id])
        require(credit["owner"] == str(gl.message.sender_address).lower() and credit["status"] == "AVAILABLE" and credit["finalized"], "owner needs an available finalized credit")
        require(attempt == credit["attempt"] + 1 and self.inflight == "", "next attempt and no unresolved native pull required")
        require(credit["purpose"] != "BOUNTY" or now() < credit["claim_deadline"], "unclaimed bounty pull deadline expired")
        amount = int(credit["amount_wei"])
        require(int(self.balance) >= int(self.liability) and amount > 0, "wait for all reserved native value to be available")
        credit.update(status="TRANSFER_PENDING", finalized=False, attempt=attempt, transfer_deadline=now() + 3600, parent="", child="")
        self.credits[credit_id] = json.dumps(credit)
        self.inflight = credit_id
        Recipient(Address(credit["owner"])).emit_transfer(value=u256(amount), on="finalized")

    @gl.public.write
    def verify_claim(self, credit_id: str, attempt: int, parent_hash: str, child_hash: str) -> None:
        credit = json.loads(self.credits[credit_id])
        require(credit["status"] == "TRANSFER_PENDING" and credit["attempt"] == attempt and self.inflight == credit_id, "matching reserved native pull required")
        contract = str(gl.message.contract_address).lower()
        def verify():
            parent, child = receipt(parent_hash), receipt(child_hash)
            require(agreed(parent) and execution(parent) in ("SUCCESS", "FINISHED_WITH_RETURN", "1"), "claim parent must finalize successfully")
            require(str(parent.get("from_address", "")).lower() == credit["owner"] and str(parent.get("to_address", "")).lower() == contract, "native claim parent identity mismatch")
            call = decoded_call(parent)
            require(call.get("method") == "claim" and list(call.get("args", [])) == [credit_id, attempt], "parent does not bind this credit and attempt")
            require(child_hash.lower() in [str(item).lower() for item in parent.get("triggered_transactions", [])] and str(child.get("triggered_by", "")).lower() == parent_hash.lower(), "native transfer is not linked to this parent")
            require(str(child.get("from_address", "")).lower() == contract and str(child.get("to_address", "")).lower() == credit["owner"] and int(child.get("value", 0)) == int(credit["amount_wei"]), "native transfer destination or amount mismatch")
            require(type(child.get("value_credited")) is bool, "native credit outcome unavailable")
            return {"paid": child["value_credited"], "parent": parent_hash.lower(), "child": child_hash.lower()}
        outcome = gl.eq_principle.strict_eq(verify)
        credit.update(status="VERIFYING", proof=outcome)
        self.credits[credit_id] = json.dumps(credit)
        gl.get_contract_at(gl.message.contract_address).emit(on="finalized").finalize_verification(credit_id, attempt)

    @gl.public.write
    def finalize_verification(self, credit_id: str, attempt: int) -> None:
        require(gl.message.sender_address == gl.message.contract_address, "self finality callback only")
        credit = json.loads(self.credits[credit_id])
        if credit["status"] != "VERIFYING" or credit["attempt"] != attempt:
            return
        proof = credit["proof"]
        credit.update(status="PAID" if proof["paid"] else "AVAILABLE", finalized=True, parent=proof["parent"], child=proof["child"], verified_at=now())
        self.credits[credit_id] = json.dumps(credit)
        self.inflight = ""
        if proof["paid"]:
            self.total_paid = u256(int(self.total_paid) + int(credit["amount_wei"]))
            self.liability = u256(int(self.liability) - int(credit["amount_wei"]))
            if credit["purpose"] == "BOUNTY":
                settlement = json.loads(self.settlements[credit["claim_id"]])
                settlement.update(status="PAID", credit_verified=True, finalized=True, parent=proof["parent"], child=proof["child"], finalized_at=now())
                self.settlements[credit["claim_id"]] = json.dumps(settlement)
                gl.get_contract_at(self.ledger).emit(on="finalized").append_change(credit["claim_id"])

    @gl.public.write
    def resolve_transfer_timeout(self, credit_id: str, attempt: int, parent_hash: str, child_hash: str) -> None:
        credit = json.loads(self.credits[credit_id])
        require(now() >= credit.get("transfer_deadline", 2**63), "native transfer resolution deadline not reached")
        self.verify_claim(credit_id, attempt, parent_hash, child_hash)

    @gl.public.write
    def resume_verification(self, credit_id: str) -> None:
        credit = json.loads(self.credits[credit_id])
        require(credit["status"] == "VERIFYING" and now() >= credit["transfer_deadline"], "verification callback resolution deadline not reached")
        gl.get_contract_at(gl.message.contract_address).emit(on="finalized").finalize_verification(credit_id, credit["attempt"])

    @gl.public.write
    def expire_unclaimed_bounty(self, credit_id: str) -> None:
        credit = json.loads(self.credits[credit_id])
        require(credit["purpose"] == "BOUNTY" and credit["status"] == "AVAILABLE" and now() >= credit["claim_deadline"], "unclaimed bounty deadline not reached")
        self._credit("unclaimed-refund:" + credit["claim_id"], credit["refund_owner"], int(credit["amount_wei"]), "REFUND")
        credit["status"] = "EXPIRED"
        self.credits[credit_id] = json.dumps(credit)
        settlement = json.loads(self.settlements[credit["claim_id"]])
        settlement.update(status="EXPIRED", finalized=True)
        self.settlements[credit["claim_id"]] = json.dumps(settlement)

    @gl.public.view
    def get_ticket(self, ticket_id: str) -> str:
        return self.tickets.get(ticket_id, "{}")

    @gl.public.view
    def get_deposit(self, deposit_id: str) -> str:
        return self.deposits.get(deposit_id, "{}")

    @gl.public.view
    def get_watch_escrow(self, watch_id: str) -> str:
        return self.escrows.get(watch_id, "{}")

    @gl.public.view
    def get_bond(self, record_id: str) -> str:
        return self.bonds.get(record_id, "{}")

    @gl.public.view
    def get_credit(self, credit_id: str) -> str:
        return self.credits.get(credit_id, "{}")

    @gl.public.view
    def get_settlement(self, claim_id: str) -> str:
        return self.settlements.get(claim_id, "{}")

    @gl.public.view
    def list_credits(self, wallet: str, offset: int, limit: int) -> str:
        require(offset >= 0 and 1 <= limit <= 50, "bounded pagination required")
        wallet = str(Address(wallet)).lower()
        keys = [self.credit_order[i] for i in range(offset, min(offset + limit, len(self.credit_order)))]
        return json.dumps({"total": len(self.credit_order), "credits": [json.loads(self.credits[key]) for key in keys if json.loads(self.credits[key])["owner"] == wallet]})

    @gl.public.view
    def get_accounting(self) -> str:
        return json.dumps({"total_deposited_wei": str(self.total_deposited), "prepared_wei": str(self.prepared_wei), "unpaid_liability_wei": str(self.liability), "total_paid_wei": str(self.total_paid), "native_balance_wei": str(self.balance), "inflight_credit": self.inflight, "deposit_cap_wei": str(CAP)})

    @gl.public.view
    def get_config(self) -> str:
        return json.dumps({"configured": self.configured, "owner": str(self.owner), "watches": str(self.watches) if self.configured else "", "claims": str(self.claims) if self.configured else "", "challenges": str(self.challenges) if self.configured else "", "ledger": str(self.ledger) if self.configured else ""})
