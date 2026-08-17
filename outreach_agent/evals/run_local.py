from __future__ import annotations

import asyncio
import copy
import json
import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from agent import run_outreach_agent
from evals.graders import grade_response
from models import OutreachRequest


def set_path(obj: dict, path: str, value) -> None:
    parts = path.split(".")
    cursor = obj
    for part in parts[:-1]:
        cursor = cursor.setdefault(part, {})
    cursor[parts[-1]] = value


async def main() -> int:
    if not (os.getenv("OPENAI_API_KEY") or os.getenv("Outreach_agent")):
        raise SystemExit("Missing Outreach_agent or OPENAI_API_KEY")
    sample = json.loads((ROOT / "data" / "sample_request.json").read_text())
    cases = [json.loads(line) for line in (ROOT / "evals" / "cases.jsonl").read_text().splitlines() if line.strip()]
    results = []
    failed = 0
    for case in cases:
        payload = copy.deepcopy(sample)
        for path, value in case.get("patch", {}).items():
            set_path(payload, path, value)
        try:
            request = OutreachRequest.model_validate(payload)
        except Exception as exc:
            expected = case.get("expect_validation_error")
            ok = bool(expected and expected in str(exc))
            results.append({"name": case["name"], "passed": ok, "validation_error": str(exc)})
            failed += 0 if ok else 1
            continue
        response = await run_outreach_agent(request)
        failures = grade_response(response, case.get("expect", {}))
        results.append({"name": case["name"], "passed": not failures, "failures": failures, "response": response.model_dump(mode="json")})
        failed += 1 if failures else 0
    out = ROOT / "evals" / "results" / "latest.json"
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(results, indent=2), encoding="utf-8")
    print(f"{len(results) - failed}/{len(results)} evals passed")
    return 1 if failed else 0


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))

