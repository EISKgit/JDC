# JDC — Just a Daily Companion

A personal life intelligence application. Users write natural-language updates about
their lives; the system converts those updates into structured events, tracks life
across seven categories, and generates evidence-backed daily, 7-day, and 30-day
insights, trends, scores, recommendations, and short-term forecasts.

> Status: a working MVP slice is running end-to-end — auth, onboarding, updates,
> AI event extraction, and the daily/7-day/30-day intelligence engine with scores,
> evidence, warnings, and forecasts, plus a React frontend for all of it. Built
> incrementally, phase by phase — see [Roadmap](#roadmap) and [Getting started](#getting-started).

## Locked MVP decisions

| Area           | Decision                                                                        |
| -------------- | -------------------------------------------------------------------------------- |
| Target         | Controlled demo/research users                                                   |
| Auth           | Email/password + Google                                                          |
| Input          | Free-form text updates (no voice in MVP)                                         |
| Categories     | Health, Career, Finance, Relationships, Learning, Personal Growth, Lifestyle     |
| Categorization | AI automatic + manual correction                                                 |
| Intelligence   | Observations + trends + 7/30-day forecasts                                       |
| Scoring        | Hybrid: deterministic metrics + LLM interpretation                               |
| Web research    | Context-triggered/on-demand, free/open sources preferred                        |
| LLM             | Provider-agnostic abstraction                                                   |
| Dashboard      | One unified dashboard with time-range intelligence (Daily / 7-day / 30-day)      |

## Core design principle

The LLM never owns the user's "truth" directly. Every insight traces back to the raw
data that produced it:

```
Raw update → Structured events → Evidence → Aggregations/metrics
           → AI analysis → Insight/forecast → Evidence references
```

This lets a user click any insight and see exactly which updates/events produced it.

## Architecture (current)

- **Backend:** FastAPI (modular monolith) + SQLAlchemy, SQLite in dev (Postgres-ready
  — swap `DATABASE_URL`, no code changes)
- **Frontend:** React + TypeScript + Vite
- **AI:** Provider-agnostic abstraction (`AIProvider`); ships with a deterministic
  `MockProvider` (no API key needed) and a real `OpenAIProvider`, switchable via
  `AI_PROVIDER` in `.env`
- **Deterministic vs. AI split:** the backend calculates every number (counts,
  scores, trend %); the AI only ever interprets already-computed numbers
- **Background jobs:** synchronous for now (event extraction/narratives run inline
  on request) — swappable for a real queue (Redis/Celery) later without changing
  business logic

Full product context lives in [`_docs/`](_docs/) (local-only, not in this repo).

## Getting started

```
# backend
cd backend
python -m venv .venv
.venv/Scripts/python.exe -m pip install -r requirements.txt
.venv/Scripts/python.exe -m uvicorn app.main:app --port 8000

# frontend (separate terminal)
cd frontend
npm install
npm run dev
```

Then open `http://localhost:5173`. No API keys required — event extraction and
AI narratives use the built-in mock provider by default. Copy `backend/.env.example`
to `backend/.env` (and `frontend/.env.example` to `frontend/.env.local`) to
customize, including switching to a real OpenAI key.

## Roadmap

Development proceeds in phases, each landing as its own set of commits:

1. ✅ **Foundation** — repo, FastAPI, React, auth (email/password + Google scaffold)
2. ✅ **Onboarding** — profile, goals, categories, initial Life Profile
3. ✅ **Updates** — natural-language update capture + timeline
4. ✅ **Event extraction** — AI-based structured event extraction + manual correction
5. ✅ **Intelligence engine** — daily / 7-day / 30-day summaries, scores, evidence,
   warnings, forecasts, dashboard
6. **Web intelligence** — context-triggered research with source citations
7. **Background workers** — move extraction/narrative generation off the request path
8. **Polish** — Alembic migrations, Postgres in Docker, richer dashboard UX, tests

Explicitly out of scope for MVP: voice input, yearly memory, long-range predictions,
medical/financial diagnosis, notifications, sharing/export, third-party integrations,
a general-purpose chat interface.

## License

[Unlicense](LICENSE) — public domain.
