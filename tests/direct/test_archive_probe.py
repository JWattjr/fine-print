import gzip
import json

ORIGINAL = "https://example.com/policy"
TIMESTAMP = "20230929213507"
CDX = "https://web.archive.org/cdx/search/cdx?url=example"
SNAPSHOT = f"https://web.archive.org/web/{TIMESTAMP}id_/{ORIGINAL}"
HTML = ("<!doctype html><html><main><p>Historical policy text.</p>" + ("Readable archived policy language. " * 80) + "</main></html>").encode()


class Response:
    def __init__(self, status, body):
        self.status = status
        self.body = body


def cdx_body(timestamp=TIMESTAMP, original=ORIGINAL, status="200"):
    return json.dumps([["timestamp", "original", "statuscode"], [timestamp, original, status]]).encode()


def run_probe(monkeypatch, direct_vm, direct_deploy, responses, label="source", original=ORIGINAL, cdx=CDX, snapshot=SNAPSHOT, timestamp=TIMESTAMP, contract=None):
    if contract is None:
        contract = direct_deploy("contracts/archive_probe.py")
    import genlayer.gl as sdk
    calls = []
    pending = iter(responses)

    def get(url, **kwargs):
        calls.append(url)
        return next(pending)

    class Return:
        def __init__(self, calldata):
            self.calldata = calldata

    def run_nondeterministic(leader, validator):
        result = Return(leader())
        return {"leader": result.calldata, "validators_agree": validator(result)}

    monkeypatch.setattr(sdk.nondet.web, "get", get)
    monkeypatch.setattr(sdk.vm, "Return", Return)
    monkeypatch.setattr(sdk.vm, "run_nondet_unsafe", run_nondeterministic)
    direct_vm._chain_id = 61999
    contract.probe(label, original, cdx, snapshot, timestamp)
    return json.loads(contract.get_probe(label)), calls, contract


def test_probe_fetches_exact_cdx_row_and_snapshot(monkeypatch, direct_vm, direct_deploy):
    result, _, _ = run_probe(monkeypatch, direct_vm, direct_deploy, [Response(200, cdx_body()), Response(200, HTML)] * 2)
    result = result["leader"]
    assert result == {
        "cdx_status": 200,
        "cdx_match": True,
        "snapshot_status": 200,
        "snapshot_chars": len(HTML.decode()),
        "gzip": False,
        "archive_marker": True,
    }


def test_wrong_cdx_url_or_status_does_not_pass(monkeypatch, direct_vm, direct_deploy):
    wrong = Response(200, cdx_body(original="https://example.com/other"))
    result, _, _ = run_probe(monkeypatch, direct_vm, direct_deploy, [wrong, Response(200, HTML)] * 2)
    result = result["leader"]
    assert result["cdx_match"] is False
    assert result["snapshot_status"] == 200


def test_probe_rejects_non_archive_hosts_and_mismatched_snapshot_path(monkeypatch, direct_vm, direct_deploy):
    result, calls, contract = run_probe(monkeypatch, direct_vm, direct_deploy, [], "bad-host", cdx="https://example.com/cdx?url=policy")
    assert result["leader"]["cdx_status"] == 0
    assert result["validators_agree"] is True
    assert calls == []

    result, calls, _ = run_probe(monkeypatch, direct_vm, direct_deploy, [], "mismatched-path", snapshot="https://web.archive.org/web/20230929213507id_/https://example.com/other", contract=contract)
    assert result["leader"]["snapshot_status"] == 0
    assert result["validators_agree"] is True
    assert calls == []


def test_probe_detects_and_decompresses_gzip(monkeypatch, direct_vm, direct_deploy):
    compressed = gzip.compress(HTML)
    assert compressed[:2] == b"\x1f\x8b"
    result, _, _ = run_probe(monkeypatch, direct_vm, direct_deploy, [Response(200, cdx_body()), Response(200, compressed)] * 2)
    result = result["leader"]
    assert result["gzip"] is True
    assert result["snapshot_chars"] == len(HTML.decode())
    assert result["archive_marker"] is True


def test_contract_requires_independent_validator_fetch(monkeypatch, direct_vm, direct_deploy):
    saved, calls, _ = run_probe(monkeypatch, direct_vm, direct_deploy, [Response(200, cdx_body()), Response(200, HTML)] * 2, "zoom-change")
    assert saved["leader"]["cdx_match"] is True
    assert saved["validators_agree"] is True
    assert len(calls) == 4


def test_contract_records_validator_mismatch(monkeypatch, direct_vm, direct_deploy):
    responses = [Response(200, cdx_body()), Response(200, HTML), Response(200, cdx_body(original="https://example.com/other")), Response(200, HTML)]
    saved, _, _ = run_probe(monkeypatch, direct_vm, direct_deploy, responses, "x-change")
    assert saved["leader"]["cdx_match"] is True
    assert saved["validators_agree"] is False
