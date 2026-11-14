# { "Depends": "py-genlayer:1jb45aa8ynh2a9c9xn3b7qqh8sm5q93hwfp7jqmwsfhh8jpz09h6" }
"""Append-only public changes, derived only from finalized peer state."""
import json
from genlayer import *


def require(ok, message):
    if not ok:
        raise gl.vm.UserError("[EXPECTED] " + message)


def load_peer(address, method, key):
    value = getattr(gl.get_contract_at(address).view(), method)(key)
    return json.loads(value)


class ChangeLedger(gl.Contract):
    owner: Address
    configured: bool
    watches: Address
    claims: Address
    challenges: Address
    bounties: Address
    entries: TreeMap[str, str]
    entry_order: DynArray[str]
    hunter_records: TreeMap[str, str]
    hunter_order: DynArray[str]
    rejected_seen: TreeMap[str, bool]
    challenges_seen: TreeMap[str, bool]

    def __init__(self):
        require(int(gl.message.chain_id) == 61999, "StudioNet only")
        self.owner = gl.message.sender_address
        self.configured = False

    @gl.public.write
    def configure(self, watches: str, claims: str, challenges: str, bounties: str) -> None:
        require(gl.message.sender_address == self.owner and not self.configured, "owner configures peers once")
        peers = [Address(watches), Address(claims), Address(challenges), Address(bounties)]
        require(all(str(peer).lower() != "0x" + "0" * 40 for peer in peers), "zero peer forbidden")
        require(len(set(str(peer).lower() for peer in peers)) == 4, "distinct peers required")
        require(all(peer != gl.message.contract_address for peer in peers), "ledger cannot be its own peer")
        self.watches, self.claims, self.challenges, self.bounties = peers
        self.configured = True

    def _hunter(self, wallet: str) -> dict:
        wallet = str(Address(wallet)).lower()
        raw = self.hunter_records.get(wallet, "")
        if raw:
            return json.loads(raw)
        self.hunter_order.append(wallet)
        return {"address": wallet, "confirmed_catches": 0, "rejected_claims": 0, "challenges_won": 0}

    @gl.public.write
    def append_change(self, claim_id: str) -> None:
        require(self.configured and gl.message.sender_address == self.bounties, "Bounties finality callback only")
        if claim_id in self.entries:
            return
        claim = load_peer(self.claims, "get_claim", claim_id)
        settlement = load_peer(self.bounties, "get_settlement", claim_id)
        closure = load_peer(self.challenges, "get_claim_summary", claim_id)
        require(claim.get("finalized") is True and claim.get("status") == "TRIGGERED" and not claim.get("voided"), "claim must be finalized and triggered")
        require(settlement.get("finalized") is True and settlement.get("status") == "PAID" and settlement.get("credit_verified") is True, "native bounty credit must be verified and finalized")
        require(settlement.get("claim_id") == claim_id and settlement.get("recipient") == claim.get("hunter"), "settlement identity mismatch")
        require(closure.get("finalized") is True and closure.get("sealed") is True and closure.get("pending") == 0 and closure.get("upheld") is False, "challenge intake must be closed without an upheld challenge")
        watch = load_peer(self.watches, "get_watch", claim["watch_id"])
        require(watch.get("finalized") is True and watch.get("criteria_hash") == claim.get("criteria_hash"), "frozen watch mismatch")
        triggered = []
        for result in claim["results"]:
            if result["verdict"] == "TRIGGERED":
                index = result["criterion_index"]
                require(0 <= index < len(watch["criteria"]) and result["quote"] in claim["passage"], "invalid triggered evidence")
                triggered.append({"criterion": watch["criteria"][index], "quote": result["quote"]})
        require(len(triggered) > 0, "a triggered criterion is required")
        entry = {
            "id": claim_id, "watch_id": claim["watch_id"], "url": watch["url"],
            "concern": watch["concern"], "criteria_hash": watch["criteria_hash"],
            "historical_replay": watch["historical_replay"], "hunter": claim["hunter"],
            "baseline_url": watch["baseline_url"], "baseline_timestamp": watch["baseline_timestamp"],
            "snapshot_url": claim["snapshot_url"], "snapshot_timestamp": claim["snapshot_timestamp"],
            "passage": claim["passage"], "triggered": triggered,
            "payout": settlement, "finalized": True,
        }
        self.entries[claim_id] = json.dumps(entry, sort_keys=True)
        self.entry_order.append(claim_id)
        hunter = self._hunter(claim["hunter"])
        hunter["confirmed_catches"] += 1
        self.hunter_records[hunter["address"]] = json.dumps(hunter)

    @gl.public.write
    def record_rejected_claim(self, claim_id: str) -> None:
        require(self.configured and gl.message.sender_address == self.claims, "Claims finality callback only")
        if self.rejected_seen.get(claim_id, False):
            return
        claim = load_peer(self.claims, "get_claim", claim_id)
        require(claim.get("finalized") is True and claim.get("status") == "NOT_TRIGGERED", "finalized negative judgment required")
        hunter = self._hunter(claim["hunter"])
        hunter["rejected_claims"] += 1
        self.hunter_records[hunter["address"]] = json.dumps(hunter)
        self.rejected_seen[claim_id] = True

    @gl.public.write
    def record_challenge_win(self, challenge_id: str) -> None:
        require(self.configured and gl.message.sender_address == self.challenges, "Challenges finality callback only")
        if self.challenges_seen.get(challenge_id, False):
            return
        challenge = load_peer(self.challenges, "get_challenge", challenge_id)
        require(challenge.get("finalized") is True and challenge.get("ruling") in ("UPHELD", "REJECTED"), "finalized challenge ruling required")
        wallet = challenge["challenger"] if challenge["ruling"] == "UPHELD" else challenge["hunter"]
        hunter = self._hunter(wallet)
        hunter["challenges_won"] += 1
        self.hunter_records[hunter["address"]] = json.dumps(hunter)
        self.challenges_seen[challenge_id] = True

    @gl.public.view
    def get_entry(self, claim_id: str) -> str:
        return self.entries.get(claim_id, "{}")

    @gl.public.view
    def list_entries(self, offset: int, limit: int) -> str:
        require(offset >= 0 and 1 <= limit <= 50, "bounded pagination required")
        ids = [self.entry_order[i] for i in range(offset, min(offset + limit, len(self.entry_order)))]
        return json.dumps({"total": len(self.entry_order), "entries": [json.loads(self.entries[key]) for key in ids]})

    @gl.public.view
    def get_hunter(self, wallet: str) -> str:
        return self.hunter_records.get(str(Address(wallet)).lower(), "{}")

    @gl.public.view
    def list_hunters(self, offset: int, limit: int) -> str:
        require(offset >= 0 and 1 <= limit <= 50, "bounded pagination required")
        wallets = [self.hunter_order[i] for i in range(offset, min(offset + limit, len(self.hunter_order)))]
        return json.dumps({"total": len(self.hunter_order), "hunters": [json.loads(self.hunter_records[wallet]) for wallet in wallets]})

    @gl.public.view
    def get_config(self) -> str:
        if not self.configured:
            return json.dumps({"configured": False, "owner": str(self.owner)})
        return json.dumps({"configured": True, "owner": str(self.owner), "watches": str(self.watches), "claims": str(self.claims), "challenges": str(self.challenges), "bounties": str(self.bounties)})
