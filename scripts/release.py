#!/usr/bin/env python3
"""Run the complete, read-only Fine Print release gate."""

from __future__ import annotations

import os
import shutil
import subprocess
import sys
import sysconfig
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CONTRACTS = ("archive_probe.py", "watches.py", "claims.py", "challenges.py", "bounties.py", "change_ledger.py")


def run(command: list[str], *, env: dict[str, str] | None = None) -> bool:
    print("\n$ " + " ".join(command), flush=True)
    return subprocess.run(command, cwd=ROOT, env=env, check=False).returncode == 0


def linter_path() -> str | None:
    for name in ("genvm-lint", "genvm-lint.exe"):
        found = shutil.which(name)
        if found:
            return found
    suffix = ".exe" if os.name == "nt" else ""
    script_dirs = [Path(sysconfig.get_path("scripts"))]
    try:
        user_scheme = sysconfig.get_preferred_scheme("user")
        script_dirs.append(Path(sysconfig.get_path("scripts", scheme=user_scheme)))
    except (KeyError, ValueError):
        pass
    for directory in script_dirs:
        candidate = directory / f"genvm-lint{suffix}"
        if candidate.is_file():
            return str(candidate)
    return None


def main() -> int:
    if not run([sys.executable, "scripts/verify_proof.py"]):
        print("Release stopped: the read-only proof gate failed.", file=sys.stderr)
        return 1

    checks = (
        ["npm", "run", "typecheck"],
        ["npm", "run", "lint"],
        ["npm", "test"],
        ["npm", "run", "test:contract"],
    )
    for check in checks:
        if not run(check):
            return 1

    linter = linter_path()
    if not linter:
        print("genvm-lint is not installed. Install requirements.txt before releasing.", file=sys.stderr)
        return 1
    for filename in CONTRACTS:
        source = ROOT / "contracts" / filename
        if not source.is_file():
            print(f"Required contract source is missing: {source}", file=sys.stderr)
            return 1
        if not run([linter, "check", str(source), "--json"]):
            return 1

    # Keep the local preview's .next directory available while building a
    # separate release candidate, and restore Next's generated TS references.
    generated_files = (ROOT / "tsconfig.json", ROOT / "next-env.d.ts")
    original_contents = {path: path.read_bytes() for path in generated_files}
    build_env = os.environ.copy()
    build_env["FP_NEXT_DIST_DIR"] = ".next-release-check"
    try:
        if not run(["npm", "run", "build"], env=build_env):
            return 1
    finally:
        for path, content in original_contents.items():
            if path.read_bytes() != content:
                path.write_bytes(content)

    print("\nRelease checks passed. Deploy the reviewed repository through the connected Vercel project.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
