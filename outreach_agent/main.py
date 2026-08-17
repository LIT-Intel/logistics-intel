from __future__ import annotations

import argparse
import asyncio
import json
import os
from pathlib import Path

from fastapi import Depends, FastAPI, Header, HTTPException

from agent import run_outreach_agent
from models import AgentResponse, OutreachRequest

app = FastAPI(title="LIT Outreach Agent", version="0.1.0")


def authorize(x_agent_service_key: str | None = Header(default=None)) -> None:
    expected = os.getenv("OUTREACH_AGENT_SERVICE_KEY")
    if expected and x_agent_service_key != expected:
        raise HTTPException(status_code=401, detail="Unauthorized")


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok", "service": "lit-outreach-agent"}


@app.post("/v1/draft", response_model=AgentResponse, dependencies=[Depends(authorize)])
async def draft(request: OutreachRequest) -> AgentResponse:
    return await run_outreach_agent(request)


async def _cli(input_path: Path) -> None:
    request = OutreachRequest.model_validate_json(input_path.read_text(encoding="utf-8"))
    response = await run_outreach_agent(request)
    print(response.model_dump_json(indent=2))


if __name__ == "__main__":
    port = os.getenv("PORT")
    if port:
        import uvicorn

        uvicorn.run("main:app", host="0.0.0.0", port=int(port))
    else:
        parser = argparse.ArgumentParser()
        parser.add_argument("--input", type=Path, default=Path("data/sample_request.json"))
        args = parser.parse_args()
        asyncio.run(_cli(args.input))

