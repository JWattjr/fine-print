# { "Depends": "py-genlayer:1jb45aa8ynh2a9c9xn3b7qqh8sm5q93hwfp7jqmwsfhh8jpz09h6" }
import json
import zlib
from genlayer import *


def _fetch_pair(original: str, cdx_url: str, snapshot_url: str, expected_timestamp: str) -> dict:
    expected_snapshot = "https://web.archive.org/web/" + expected_timestamp + "id_/" + original
    if not cdx_url.startswith("https://web.archive.org/cdx/search/cdx?") or snapshot_url != expected_snapshot:
        return {"cdx_status": 0, "cdx_match": False, "snapshot_status": 0, "snapshot_chars": 0, "gzip": False, "archive_marker": False}
    try:
        cdx = gl.nondet.web.get(cdx_url, headers={"User-Agent": "Mozilla/5.0 FinePrint/0.1"})
        cdx_text = cdx.body.decode("utf-8", errors="replace")
        rows = json.loads(cdx_text)
        exact_row = isinstance(rows, list) and any(
            isinstance(row, list)
            and len(row) >= 3
            and row[0] == expected_timestamp
            and row[1] == original
            and row[2] == "200"
            for row in rows
        )
    except Exception:
        return {"cdx_status": 0, "cdx_match": False, "snapshot_status": 0, "snapshot_chars": 0, "gzip": False, "archive_marker": False}

    try:
        snapshot = gl.nondet.web.get(snapshot_url, headers={"User-Agent": "Mozilla/5.0 FinePrint/0.1"})
        raw = snapshot.body
        gzipped = len(raw) > 2 and raw[:2] == b"\x1f\x8b"
        if gzipped:
            raw = zlib.decompress(raw, 16 + zlib.MAX_WBITS)
        text = raw.decode("utf-8", errors="replace")
        lower = text.lower()
        error_page = "wayback machine error" in lower or "this url has been excluded" in lower or "page not found" in lower
        return {
            "cdx_status": cdx.status,
            "cdx_match": cdx.status == 200 and exact_row,
            "snapshot_status": snapshot.status,
            "snapshot_chars": len(text),
            "gzip": gzipped,
            "archive_marker": ("<html" in lower or "<!doctype html" in lower) and not error_page,
        }
    except Exception:
        return {"cdx_status": cdx.status, "cdx_match": expected_timestamp in cdx_text, "snapshot_status": 0, "snapshot_chars": 0, "gzip": False, "archive_marker": False}


class ArchiveProbe(gl.Contract):
    probes: TreeMap[str, str]

    def __init__(self):
        pass

    @gl.public.write
    def probe(self, label: str, original: str, cdx_url: str, snapshot_url: str, expected_timestamp: str) -> None:
        def fetch():
            return _fetch_pair(original, cdx_url, snapshot_url, expected_timestamp)

        def agree(result):
            if not isinstance(result, gl.vm.Return):
                return False
            own = fetch()
            leader = result.calldata
            return (
                own["cdx_status"] == leader["cdx_status"]
                and own["cdx_match"] == leader["cdx_match"]
                and own["snapshot_status"] == leader["snapshot_status"]
                and (own["snapshot_chars"] > 1000) == (leader["snapshot_chars"] > 1000)
                and own["archive_marker"] == leader["archive_marker"]
            )

        self.probes[label] = json.dumps(gl.vm.run_nondet_unsafe(fetch, agree))

    @gl.public.view
    def get_probe(self, label: str) -> str:
        return self.probes.get(label, "{}")
