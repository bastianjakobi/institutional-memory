# Onboarding Dashboard

Web app on top of the Managed Agents memory stores. Two UIs share the same backend modules:

| URL | UI |
| --- | --- |
| `/` | New React + Tailwind UI (`dashboard/web/`) |
| `/classic/` | Original Streamlit UI (`dashboard/app.py`) |

```bash
pip install -r requirements.txt
export ANTHROPIC_API_KEY=sk-ant-...      # or put it in .env
cd dashboard/web && npm install
npm run dev                              # API :8000 + Streamlit :8501 + Vite :5173
# open http://localhost:5173  (classic UI: http://localhost:5173/classic/)
python -m pytest -q                      # offline tests (core logic + HTTP API)
```

`npm run dev` starts all three processes; Vite proxies `/api` to FastAPI and `/classic` to
Streamlit, so everything lives on one origin. Single-port alternative: `npm run build`, then
`uvicorn dashboard.server:app --port 8000` serves the built UI (and redirects `/classic` to the
Streamlit process, `CLASSIC_UI_URL`, default `http://localhost:8501/classic/`). The classic UI
alone still runs with `streamlit run dashboard/app.py`.

First load provisions an agent, environment and the global `team-knowledge`
store (IDs cached in `dashboard/.state/`, gitignored).

| Who | Global store | Personal store |
| --- | --- | --- |
| Experienced colleague | `read_write` | — |
| New hire | `read_only` | `read_write` (created on first use, per name) |

Access is enforced by the API, not by the prompt.

## Demo script

1. **Experienced colleague** "Tom": upload `synthetic-data/round1/*.md` → Ingest.
2. **New hire** "Alice", role *Backend Engineer*: see role briefing + suggested questions.
   Click *"How do I get read-only prod access?"*.
3. Switch to **Tom**: upload `synthetic-data/round2/*.md` → Ingest.
4. Back to **Alice** → ↻ Refresh: prod-access card shows a new date; *Timeline* tab
   shows created → modified with a diff, attributed to Tom.
5. Alice: *"From now on answer only in bullet points."* → appears under *My preferences*.
6. New hire "Bob" asks the same question → prose answer (Alice's preference is hers only).

## Layout

- `core.py`: pure logic (store registry, attribution, timeline+diffs, briefing parsing/cache key). Tested.
- `api.py`: Anthropic adapter (provisioning, memory reads, version history, briefing call, sessions).
- `server.py`: FastAPI JSON API for the React UI; agent sessions stream as NDJSON events
  (`text` / `memory_op` / `error` / `done`). Tested in `tests/test_server.py`.
- `web/`: React + Tailwind UI (Vite, TypeScript).
- `app.py`: classic Streamlit UI.
