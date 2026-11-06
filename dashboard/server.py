"""JSON + streaming HTTP API for the React dashboard (`dashboard/web/`).

    uvicorn dashboard.server:app --port 8000

Wraps `dashboard/api.py` (Anthropic adapter) and `dashboard/core.py` (pure logic);
the classic Streamlit UI in `dashboard/app.py` uses the same modules.
"""

from __future__ import annotations

import json
import os
import sys
import threading
import time
from dataclasses import asdict
from pathlib import Path
from typing import Callable, Iterator

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.responses import FileResponse, JSONResponse, RedirectResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

import anthropic

from dashboard import api
from dashboard.core import Briefing, Mode, briefing_cache_key, ingest_message, new_hire_message

app = FastAPI(title="Onboarding Memory API")

MEMORY_TTL = 20.0  # seconds; matches the classic UI


# --------------------------------------------------------------------------- tiny in-process caches


class _Cache:
    def __init__(self):
        self._data: dict[tuple, tuple[float, object]] = {}
        self._lock = threading.Lock()

    def get(self, key: tuple, compute: Callable[[], object], ttl: float | None = None):
        with self._lock:
            hit = self._data.get(key)
        if hit and (ttl is None or time.monotonic() - hit[0] < ttl):
            return hit[1]
        value = compute()
        with self._lock:
            self._data[key] = (time.monotonic(), value)
        return value

    def drop(self, kind: str) -> None:
        with self._lock:
            for key in [k for k in self._data if k[0] == kind]:
                del self._data[key]


cache = _Cache()


def _memories(store_id: str, fresh: bool = False) -> list[api.Memory]:
    if fresh:
        cache.drop("memories")
    return cache.get(("memories", store_id), lambda: api.list_memories(store_id), ttl=MEMORY_TTL)


def _memory_json(m: api.Memory) -> dict:
    return asdict(m)


@app.exception_handler(RuntimeError)
async def _runtime_error(_, exc: RuntimeError):  # e.g. missing ANTHROPIC_API_KEY
    return JSONResponse(status_code=503, content={"detail": str(exc)})


@app.exception_handler(anthropic.APIStatusError)
async def _anthropic_error(_, exc: anthropic.APIStatusError):  # auth/permission/rate-limit from upstream
    return JSONResponse(status_code=502, content={"detail": f"Anthropic API error {exc.status_code}: {exc.message}"})


def _global_store() -> str:
    try:
        return api.global_store()
    except Exception as e:  # provisioning / auth failure: surface it to the UI
        raise HTTPException(503, f"Could not connect to Anthropic: {e}") from e


def _clean_name(name: str) -> str:
    name = name.strip()
    if not name:
        raise HTTPException(422, "Name is required.")
    return name


# --------------------------------------------------------------------------- reads


@app.get("/api/config")
def config():
    return {"roles": api.ROLES}


@app.get("/api/memories")
def memories(fresh: bool = False):
    return [_memory_json(m) for m in _memories(_global_store(), fresh)]


@app.get("/api/memories/{memory_id}/timeline")
def timeline(memory_id: str, sha: str = ""):
    store = _global_store()
    entries = cache.get(("timeline", memory_id, sha), lambda: api.timeline(store, memory_id))
    return [asdict(e) for e in entries]


@app.get("/api/briefing")
def briefing(role: str):
    if role not in api.ROLES:
        raise HTTPException(422, f"Unknown role: {role}")
    mems = _memories(_global_store())
    if not mems:
        return {"relevant": [], "questions": []}
    key = briefing_cache_key(role, {m.path: m.sha256 for m in mems})
    try:
        b: Briefing = cache.get(("briefing", key), lambda: api.briefing(role, mems))
    except ValueError as e:
        raise HTTPException(502, f"Couldn't build briefing: {e}") from e
    return {"relevant": [{"path": p, "why": why} for p, why in b.relevant], "questions": b.questions}


@app.get("/api/users/{name}/preferences")
def preferences(name: str):
    store = api.registry.user_store(_clean_name(name))
    return [_memory_json(m) for m in api.list_memories(store)]


# --------------------------------------------------------------------------- sessions (streamed NDJSON)


def _ndjson(events: Iterator[dict]) -> StreamingResponse:
    def body():
        try:
            for e in events:
                yield json.dumps(e) + "\n"
        except Exception as e:  # stream already started: report in-band
            yield json.dumps({"type": "error", "event": f"{type(e).__name__}: {e}"}) + "\n"
        finally:
            cache.drop("memories")  # the session may have written memory
        yield json.dumps({"type": "done"}) + "\n"

    return StreamingResponse(body(), media_type="application/x-ndjson")


class ChatTurn(BaseModel):
    role: str = Field(pattern="^(user|assistant)$")
    content: str


class ChatRequest(BaseModel):
    name: str
    role: str
    question: str
    history: list[ChatTurn] = []


@app.post("/api/chat")
def chat(req: ChatRequest):
    name = _clean_name(req.name)
    if not req.question.strip():
        raise HTTPException(422, "Question is required.")
    _global_store()
    history = [t.model_dump() for t in req.history]
    return _ndjson(
        api.session_events(
            name=name,
            mode=Mode.NEW_HIRE,
            title=f"{name} ({req.role})",
            message=new_hire_message(name, req.role, history, req.question),
        )
    )


@app.post("/api/ingest")
async def ingest(name: str = Form(...), note: str = Form(""), files: list[UploadFile] = File(default=[])):
    name = _clean_name(name)
    docs = [(f.filename or "document", (await f.read()).decode("utf-8", errors="replace")) for f in files]
    if not (note.strip() or docs):
        raise HTTPException(422, "Add a note or at least one document.")
    _global_store()
    return _ndjson(
        api.session_events(
            name=name, mode=Mode.EXPERT, title=f"Ingest by {name}", message=ingest_message(name, note, docs)
        )
    )


# --------------------------------------------------------------------------- built UI (single-port mode)
# After `npm run build` in dashboard/web, `uvicorn dashboard.server:app` serves the React UI too.
# The classic Streamlit UI is its own process (baseUrlPath=classic); without the Vite proxy we redirect to it.

CLASSIC_URL = os.environ.get("CLASSIC_UI_URL", "http://localhost:8501/classic/")
DIST = Path(__file__).parent / "web" / "dist"


@app.get("/classic", include_in_schema=False)
@app.get("/classic/{_rest:path}", include_in_schema=False)
def classic(_rest: str = ""):
    return RedirectResponse(CLASSIC_URL)


@app.api_route("/api/{_rest:path}", methods=["GET", "POST", "PUT", "PATCH", "DELETE"], include_in_schema=False)
def api_not_found(_rest: str):
    raise HTTPException(404, "Not found")


if DIST.exists():
    app.mount("/assets", StaticFiles(directory=DIST / "assets"), name="assets")

    @app.get("/{_path:path}", include_in_schema=False)
    def spa(_path: str):
        return FileResponse(DIST / "index.html")
