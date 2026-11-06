"""HTTP layer for the React UI, with the Anthropic adapter stubbed out."""

import json
from types import SimpleNamespace as NS

import pytest
from fastapi.testclient import TestClient

from dashboard import api, server
from dashboard.core import Briefing

MEMS = [api.Memory("m1", "/prod-access.md", "ask #sre", "h1", "2026-05-01")]


@pytest.fixture
def client(monkeypatch):
    calls = NS(briefing=0, sessions=[])
    monkeypatch.setattr(api, "global_store", lambda: "g")
    monkeypatch.setattr(api, "list_memories", lambda store, prefix="/": MEMS if store == "g" else [])
    monkeypatch.setattr(api, "registry", NS(user_store=lambda name: f"u-{name}"))

    def briefing(role, mems):
        calls.briefing += 1
        return Briefing([("/prod-access.md", "you need prod")], ["How do I get prod?"])

    def session_events(**kw):
        calls.sessions.append(kw)
        yield {"type": "memory_op", "tool": "read", "path": "/mnt/memory/x.md"}
        yield {"type": "text", "text": "hello"}

    monkeypatch.setattr(api, "briefing", briefing)
    monkeypatch.setattr(api, "session_events", session_events)
    server.cache.drop("memories")
    server.cache.drop("briefing")
    return TestClient(server.app), calls


def ndjson(resp):
    return [json.loads(line) for line in resp.text.splitlines() if line]


def test_briefing_is_cached_until_memory_changes(client):
    c, calls = client

    first = c.get("/api/briefing", params={"role": "Backend Engineer"}).json()
    c.get("/api/briefing", params={"role": "Backend Engineer"})

    assert first == {"relevant": [{"path": "/prod-access.md", "why": "you need prod"}], "questions": ["How do I get prod?"]}
    assert calls.briefing == 1


def test_unknown_role_is_rejected(client):
    c, _ = client
    assert c.get("/api/briefing", params={"role": "Wizard"}).status_code == 422


def test_chat_streams_events_and_replays_history_as_new_hire(client):
    c, calls = client
    resp = c.post(
        "/api/chat",
        json={"name": " Alice ", "role": "Backend Engineer", "question": "prod?",
              "history": [{"role": "user", "content": "earlier q"}]},
    )

    assert [e["type"] for e in ndjson(resp)] == ["memory_op", "text", "done"]
    (kw,) = calls.sessions
    assert kw["mode"] is server.Mode.NEW_HIRE
    assert kw["name"] == "Alice"
    assert "USER: earlier q" in kw["message"] and kw["message"].endswith("prod?")


def test_ingest_sends_note_and_documents_as_expert(client):
    c, calls = client
    resp = c.post("/api/ingest", data={"name": "Tom", "note": "heads up"},
                  files=[("files", ("policy.md", b"# New policy", "text/markdown"))])

    assert ndjson(resp)[-1] == {"type": "done"}
    (kw,) = calls.sessions
    assert kw["mode"] is server.Mode.EXPERT
    assert "NOTE FROM Tom:\nheads up" in kw["message"]
    assert "===== DOCUMENT: policy.md =====\n# New policy" in kw["message"]


def test_ingest_requires_note_or_file(client):
    c, _ = client
    assert c.post("/api/ingest", data={"name": "Tom", "note": "  "}).status_code == 422


def test_session_failure_mid_stream_is_reported_in_band(client, monkeypatch):
    c, _ = client

    def boom(**kw):
        yield {"type": "text", "text": "partial"}
        raise RuntimeError("network down")

    monkeypatch.setattr(api, "session_events", boom)
    events = ndjson(c.post("/api/chat", json={"name": "A", "role": "Data Engineer", "question": "q"}))

    assert events[1]["type"] == "error" and "network down" in events[1]["event"]
    assert events[-1] == {"type": "done"}


def test_classic_ui_redirects_and_unknown_api_paths_404(client):
    c, _ = client
    assert c.get("/classic/", follow_redirects=False).status_code == 307
    assert c.get("/api/nope").status_code == 404
