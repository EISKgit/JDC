# JDC — Just a Daily Companion

A personal life intelligence application. Users write natural-language updates about
their lives; the system converts those updates into structured events, tracks life
across seven categories, and generates evidence-backed daily, 7-day, and 30-day
insights, trends, scores, recommendations, and short-term forecasts.

> Status: a working MVP slice runs end-to-end — auth, onboarding, updates, AI event
> extraction, and the daily/7-day/30-day intelligence engine with scores, evidence,
> warnings, and forecasts, plus a React frontend for all of it. Built incrementally,
> phase by phase. The GitHub repo/folder is named `ILC` from an earlier project name;
> only the product's display name changed to JDC.

## Contents

- [Locked MVP decisions](#locked-mvp-decisions)
- [How it works](#how-it-works)
- [Project structure — what is where](#project-structure--what-is-where)
- [Setup](#setup)
- [Start](#start)
- [Stop](#stop)
- [Use](#use)
- [API reference](#api-reference)
- [Configuration reference](#configuration-reference)
- [Test](#test)
- [Roadmap](#roadmap)
- [License](#license)

## Locked MVP decisions

| Area           | Decision                                                                     |
| -------------- | ---------------------------------------------------------------------------- |
| Target         | Controlled demo/research users                                               |
| Auth           | Email/password + Google                                                      |
| Input          | Free-form text updates (no voice in MVP)                                     |
| Categories     | Health, Career, Finance, Relationships, Learning, Personal Growth, Lifestyle |
| Categorization | AI automatic + manual correction                                             |
| Intelligence   | Observations + trends + 7/30-day forecasts                                   |
| Scoring        | Hybrid: deterministic metrics + LLM interpretation                           |
| Web research   | Context-triggered/on-demand, free/open sources preferred (not yet built)     |
| LLM            | Provider-agnostic abstraction                                                |
| Dashboard      | One unified dashboard with time-range intelligence (Daily / 7-day / 30-day)  |

Explicitly out of scope for the MVP: voice input, yearly memory, long-range
predictions, medical/financial diagnosis, notifications, sharing/export,
third-party integrations, a general-purpose chat interface.

## How it works

### The core principle: the AI never owns the user's "truth"

Every insight traces back to the exact raw text that produced it:

```
Raw update → Structured events → Evidence → Aggregations/metrics
           → AI analysis → Insight/forecast → Evidence references
```

Concretely: a user's raw `Update` is saved first, before anything else happens to
it. An AI provider then extracts structured `Event` rows from that text — each
`Event` keeps a foreign key back to the `Update` it came from. Every score, trend,
and narrative the app generates is built from those `Event` rows, and every one of
those can point back to the specific events (and through them, updates) behind it.
That backward chain is what lets a user click any insight and see the evidence.

### Deterministic vs. AI, split on purpose

The backend calculates every number itself — counts, category scores, percentage
changes, trend direction. The AI is only ever handed those already-computed numbers
and asked to explain what they mean in plain language (see
`app/services/intelligence.py` and `AIProvider.generate_narrative`). This means no
score or trend can ever be an AI hallucination; you can always recompute it by hand
from the `events` table.

### Request flow, end to end

1. **Sign up / log in** (`POST /auth/register` or `/auth/login`) → the backend
   issues a JWT, stored in the browser's `localStorage`.
2. **Onboarding** (`PUT /onboarding`) → the user's free-text answers are saved, and
   the AI provider generates a short `ai_summary` from them.
3. **Write an update** (`POST /updates`) → the raw text is saved immediately, then
   the AI provider (`extract_events`) turns it into structured `Event` rows
   (category, type, sentiment, confidence, amount/duration if present) — all in the
   same request, synchronously. If AI extraction fails, the update itself is still
   safely saved.
4. **Correct an event** (`PATCH /events/{id}`) → fixes a wrong category/type/
   sentiment and flags it `is_corrected`; `DELETE /events/{id}` removes one that
   shouldn't exist.
5. **View intelligence** (`GET /intelligence/daily|weekly|monthly`,
   `GET /dashboard`, `GET /intelligence/forecast`) → on each request, the backend
   pulls the relevant `Event` rows for the time window, computes scores/trends/
   evidence/warnings deterministically, then makes one AI call to phrase a
   narrative, a recommendation, and any warnings in plain language.

### The AI provider abstraction

`app/ai/providers/base.py` defines one interface (`AIProvider`) with two methods:
`extract_events(text)` and `generate_narrative(kind, context)`. Nothing else in the
codebase talks to a specific AI vendor — the extraction service, onboarding, and the
intelligence engine only ever depend on this interface. Two implementations exist:

- **`MockProvider`** (default, `AI_PROVIDER=mock`) — no API key needed. Deterministic,
  rule-based: keyword-matches sentences to categories, regex-extracts
  amounts/durations, and picks sentiment from small positive/negative word lists.
  Good enough to make the whole app runnable and demoable with zero setup.
- **`OpenAIProvider`** (`AI_PROVIDER=openai`) — calls OpenAI's Chat Completions API
  directly over HTTP (`httpx`, no vendor SDK), asking for JSON-formatted responses.
  Real AI output, no other code changes required to switch to it.

### Scoring, trends, and forecasts — the actual formulas

- **Category score** (0-100, starts at 50): `+5` per event this period (capped at
  `+30`), `±4` per net positive/negative event (capped at `±20`), plus a consistency
  bonus for activity spread across more distinct days (capped at `+20`). See
  `compute_category_score` in `backend/app/services/metrics.py`. The 50 is a
  neutral baseline, not a result — so the dashboard shows **"—"** for any category
  with 0 events (and for the overall score when there are no events at all)
  instead of a misleading 50.
- **Overall score**: a *weighted* average of category scores, not a plain average —
  categories the user picked as a focus area during onboarding count 1.5x. This
  avoids one very low category getting hidden by high scores elsewhere. See
  `compute_overall_score`.
- **Trend/forecast direction**: compares the current period's event count in a
  category to the equal-length previous period. Fewer than 3 total events across
  both windows → `insufficient_evidence`, explicitly, rather than pretending there's
  a trend. Otherwise `> +15%` change → `improving`, `< -15%` → `declining`, else
  `stable`; confidence (`low`/`medium`/`high`) reflects sample size. See
  `compute_trend` in `backend/app/services/forecasting.py`.
- **Warnings**: rule-based — 3+ negative-sentiment events in one category within the
  period triggers one; only the wording comes from the AI.
- **Recommendation**: targets the lowest-scoring category *among those with
  activity this week* — untouched categories sit at the 50 baseline and would
  otherwise always "win". With no events at all there's nothing to compare, so a
  fixed "log your first update" message is shown instead (no AI call). See `generate_dashboard` in `backend/app/services/intelligence.py`.

## Project structure — what is where

```
ILC/
├── README.md              ← this file
├── LICENSE                  ← Unlicense (public domain)
├── .gitignore
│
├── backend/                 FastAPI application
│   ├── requirements.txt       exact pinned Python dependencies
│   ├── requirements-dev.txt     + test tools (pytest)
│   ├── pytest.ini                 pytest config (looks in tests/)
│   ├── .env.example             config template — copy to .env
│   ├── tests/                   pytest suite (uses a throwaway SQLite DB)
│   │   ├── conftest.py            test DB setup + `client` fixture
│   │   ├── test_auth.py             register/login/me, password + email rules
│   │   ├── test_metrics.py            score formulas
│   │   ├── test_mock_extraction.py      mock AI keyword classification
│   │   ├── test_dashboard.py            dashboard empty state + readable narratives
│   │   └── test_timestamps.py             API timestamps carry an explicit UTC offset
│   └── app/
│       ├── main.py               creates the FastAPI app, CORS, DB startup
│       ├── core/
│       │   ├── config.py           typed settings, read from .env
│       │   └── security.py         password hashing (bcrypt) + JWT create/verify
│       ├── db/
│       │   ├── base.py               SQLAlchemy declarative Base
│       │   └── session.py            DB engine/connection + per-request session
│       ├── models/                 SQLAlchemy tables
│       │   ├── enums.py              Category, GoalStatus, Sentiment
│       │   ├── user.py                 users
│       │   ├── life_profile.py           life_profiles (onboarding answers)
│       │   ├── goal.py                     goals
│       │   ├── update.py                     updates (raw user text)
│       │   └── event.py                        events (AI-extracted structured facts)
│       ├── schemas/                Pydantic request/response shapes (API contracts,
│       │                             deliberately separate from the DB models)
│       │   └── common.py               UTCDateTime — timestamps always sent with "Z"
│       ├── ai/
│       │   ├── providers/
│       │   │   ├── base.py               AIProvider interface + AIProviderError
│       │   │   ├── mock.py                 deterministic, no-API-key provider
│       │   │   └── openai_provider.py        real OpenAI-backed provider
│       │   └── factory.py                get_ai_provider() — picks a provider from .env
│       ├── services/                Business logic (no HTTP concerns here)
│       │   ├── event_extraction.py    runs AI extraction, persists Event rows
│       │   ├── metrics.py               deterministic counts + score formulas
│       │   ├── forecasting.py             trend classification (compute_trend)
│       │   └── intelligence.py              orchestrates metrics+AI into summaries,
│       │                                       forecasts, and the dashboard payload
│       └── api/v1/                 HTTP endpoints (thin — delegate to services)
│           ├── router.py             collects every v1 router
│           ├── auth.py                 register/login/me/Google OAuth
│           ├── categories.py             GET /categories (the 7 fixed categories)
│           ├── onboarding.py               GET/PUT /onboarding
│           ├── goals.py                      goals CRUD
│           ├── updates.py                      updates create/list/detail (+ extraction)
│           ├── events.py                         manual event correction/deletion
│           └── intelligence.py                     daily/weekly/monthly/forecast/dashboard
│
├── frontend/                 React + TypeScript + Vite application
│   ├── .env.example             config template — copy to .env.local
│   ├── tests/                   Vitest suite (jsdom, fetch mocked)
│   │   ├── client.test.ts         API client: auth header, errors, 204s
│   │   ├── ProtectedRoute.test.tsx  login redirect
│   │   ├── Dashboard.test.tsx         "—" empty state, real scores, JDC guide
│   │   ├── Updates.test.tsx             date-wise history: grouping, chips, date picker
│   │   └── dates.test.ts                  day keys, Today/Yesterday, streaks
│   └── src/
│       ├── main.tsx               app entry point (router + auth provider)
│       ├── App.tsx                  route definitions
│       ├── index.css                  all styling: design tokens, light/dark, mobile
│       ├── lib/
│       │   ├── categories.ts            icon + accent color per life area
│       │   └── dates.ts                   local-day grouping, labels, streak
│       ├── api/
│       │   ├── client.ts                fetch wrapper: attaches JWT, parses errors
│       │   └── types.ts                   TypeScript types mirroring backend schemas
│       ├── context/
│       │   └── AuthContext.tsx              logged-in user + login/register/logout
│       ├── components/
│       │   ├── ProtectedRoute.tsx             redirects to /login if signed out
│       │   ├── NavBar.tsx                       sticky top navigation
│       │   ├── AboutJdc.tsx                       "JDC at a glance" guide on the dashboard
│       │   ├── AuthLayout.tsx                       two-panel login/signup layout
│       │   └── Logo.tsx                               the JDC logo mark
│       └── pages/
│           ├── Login.tsx / Signup.tsx
│           ├── Onboarding.tsx                     the "Life Profile" form
│           ├── Updates.tsx                          "What happened today?", date-wise
│           │                                          history, event correction
│           └── Dashboard.tsx                          "Your Life Overview"
│
└── _docs/                    LOCAL ONLY — gitignored, never pushed to GitHub
    ├── README.md                explains the two original product-vision .docx files
    ├── *.docx                     the original product-vision source documents
    └── learning/                  plain-language write-up of every commit made so far —
                                      what was built, why, exactly which commands were run
                                      and what they do, and where the result lives
```

## Setup

### Prerequisites

- Python 3.12+ (`python --version`)
- Node.js 20+ and npm (`node --version`, `npm --version`)
- Git

No database server, Docker, or API keys are required to run this locally — SQLite
and a mock AI provider are the defaults.

### Backend

```
cd backend
python -m venv .venv
.venv/Scripts/python.exe -m pip install -r requirements.txt      # Windows
# .venv/bin/python -m pip install -r requirements.txt            # macOS/Linux
copy .env.example .env      # Windows — optional, defaults already work
# cp .env.example .env      # macOS/Linux
```

The database (`backend/ilc.db`, SQLite) is created automatically the first time the
server starts — no migration step needed.

### Frontend

```
cd frontend
npm install
copy .env.example .env.local      # Windows — optional, defaults already work
# cp .env.example .env.local      # macOS/Linux
```

## Start

Run both in separate terminals — the frontend expects the backend at
`http://localhost:8000`.

```
# Terminal 1 — backend, from backend/
.venv/Scripts/python.exe -m uvicorn app.main:app --port 8000 --reload

# Terminal 2 — frontend, from frontend/
npm run dev
```

- App: **http://localhost:5173**
- API base: **http://localhost:8000/api/v1**
- Interactive API docs (auto-generated by FastAPI): **http://localhost:8000/docs**
- Health check: **http://localhost:8000/health**

`--reload` makes the backend restart automatically on code changes; omit it for a
plain run. Vite's dev server also hot-reloads on save by default.

## Stop

Press `Ctrl+C` in each terminal running `uvicorn` / `npm run dev`.

If a server was started in the background and the terminal was lost, find and stop
it by port:

```
# Windows (PowerShell)
Get-NetTCPConnection -LocalPort 8000 | Select-Object -ExpandProperty OwningProcess | ForEach-Object { Stop-Process -Id $_ -Force }
Get-NetTCPConnection -LocalPort 5173 | Select-Object -ExpandProperty OwningProcess | ForEach-Object { Stop-Process -Id $_ -Force }

# macOS/Linux
lsof -ti:8000 | xargs kill -9
lsof -ti:5173 | xargs kill -9
```

To reset all local data, stop the backend and delete `backend/ilc.db` — it's
recreated empty on the next start.

## Use

A full walkthrough of the product loop, using either the UI at
`http://localhost:5173` or the API directly:

1. **Sign up** at `/signup` (or Google, once configured — see
   [Configuration reference](#configuration-reference)).
2. **Fill in your Life Profile** at `/onboarding`: a line about yourself, what you
   want to improve, which life areas you care about, and any current challenges.
   Saving generates a short AI summary of it.
3. **Write an update** at `/updates` — e.g. *"Worked on my backend project for 4
   hours. Skipped the gym because I was tired. Spent $800 eating outside. Had an
   argument with my friend."* It's saved immediately, then AI-extracted into
   separate Health/Career/Finance/Relationships events, each shown with its
   category, sentiment, and confidence.
4. **Correct anything the AI got wrong** — change an event's category from the
   dropdown, or remove one that shouldn't exist. Corrections are tracked
   (`is_corrected`).
5. **Look back through your history** — below the update box, entries are grouped
   by day (*Today*, *Yesterday*, then full dates), each day showing which life
   areas it touched. Click a day chip to see just that day, or use **Jump to date**
   to pick any date; **Show all days** returns to the full list. The header shows
   your total entries, days logged, and current daily streak. Days follow your
   local timezone.
6. **Check the dashboard** at `/dashboard` — overall score, per-category scores
   with trend arrows, the week's top observation, any warnings (e.g. repeated
   negative-sentiment events in one category), a recommendation, and a 7-day
   forecast per category. A brand-new account shows **"—"** instead of scores and
   a "log your first update" prompt until there's activity; categories you haven't
   logged anything in yet stay "—". The **JDC at a glance** guide at the top
   explains what JDC is, how to use it, and where each result appears; it's open
   for new users and collapsed once you have data (**How JDC works** reopens it,
   and your choice is remembered).
7. Keep logging updates over multiple days — scores, trends, and forecasts become
   more meaningful as more evidence accumulates (a single day of data will
   correctly show "not enough data" for most trends, by design).

> **Mock provider note:** the default `AI_PROVIDER=mock` classifies each sentence
> by whole-word keywords (so *"run,"*, *"studied"* and *"walking"* are recognised,
> but *"ready"* isn't mistaken for *"read"*). Money verbs like *"spent"* only count
> as Finance when there's an amount (`$`/`₹`) or no duration — *"Spent 2 hours
> studying"* is Learning, *"Spent $800 eating out"* is Finance. Sentences with no
> keyword fall back to Lifestyle. It's still a simple rule-based stand-in; a real
> provider (`AI_PROVIDER=openai`) understands free-form text far better.

## API reference

All endpoints below are under `/api/v1` and (except registration/login) require
`Authorization: Bearer <token>`. Full interactive docs with request/response
schemas: `http://localhost:8000/docs`.

| Method | Path                                    | Purpose                                                 |
| ------ | --------------------------------------- | ------------------------------------------------------- |
| POST   | `/auth/register`                      | Create an account, returns a JWT                        |
| POST   | `/auth/login`                         | Log in, returns a JWT                                   |
| GET    | `/auth/me`                            | Current user                                            |
| GET    | `/auth/google/login`                  | Redirect to Google sign-in (if configured)              |
| GET    | `/auth/google/callback`               | Google OAuth callback                                   |
| GET    | `/categories`                         | The 7 fixed life categories                             |
| GET    | `/onboarding`                         | Current user's Life Profile (or`null`)                |
| PUT    | `/onboarding`                         | Create/update the Life Profile (regenerates AI summary) |
| POST   | `/goals`                              | Create a goal                                           |
| GET    | `/goals`                              | List goals                                              |
| PATCH  | `/goals/{id}`                         | Update a goal                                           |
| DELETE | `/goals/{id}`                         | Delete a goal                                           |
| POST   | `/updates`                            | Create an update (triggers AI event extraction)         |
| GET    | `/updates`                            | List updates (with their events)                        |
| GET    | `/updates/{id}`                       | One update, with its events                             |
| PATCH  | `/events/{id}`                        | Correct an event's category/type/description/sentiment  |
| DELETE | `/events/{id}`                        | Remove an incorrect event                               |
| GET    | `/intelligence/daily`                 | 1-day summary: scores, evidence, warnings, narrative    |
| GET    | `/intelligence/weekly`                | 7-day summary                                           |
| GET    | `/intelligence/monthly`               | 30-day summary                                          |
| GET    | `/intelligence/forecast?horizon=7\|30` | Per-category forecast                                   |
| GET    | `/dashboard`                          | Trimmed "3-5 things that matter" view                   |
| GET    | `/health` *(not under /api/v1)*     | Liveness check                                          |

## Configuration reference

### Backend (`backend/.env`, copy from `.env.example`)

| Variable                                        | Default                                               | Notes                                                              |
| ----------------------------------------------- | ----------------------------------------------------- | ------------------------------------------------------------------ |
| `DATABASE_URL`                                | `sqlite:///./ilc.db`                                | Point at a Postgres URL later — no code changes needed            |
| `SECRET_KEY`                                  | `dev-only-secret-change-me`                         | JWT signing key — change for anything beyond local dev            |
| `ACCESS_TOKEN_EXPIRE_MINUTES`                 | `10080` (7 days)                                    | JWT lifetime                                                       |
| `CORS_ORIGINS`                                | `http://localhost:5173`                             | Comma-separated list of allowed browser origins                    |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | *(blank)*                                           | Leave blank to disable Google sign-in (returns 501, doesn't crash) |
| `GOOGLE_REDIRECT_URI`                         | `http://localhost:8000/api/v1/auth/google/callback` | Must match the Google Cloud Console OAuth client config            |
| `AI_PROVIDER`                                 | `mock`                                              | `mock` (no key needed) or `openai`                             |
| `OPENAI_API_KEY`                              | *(blank)*                                           | Required only if`AI_PROVIDER=openai`                             |
| `OPENAI_MODEL`                                | `gpt-4o-mini`                                       | Any OpenAI chat-completions-compatible model                       |

### Frontend (`frontend/.env.local`, copy from `.env.example`)

| Variable              | Default                          | Notes                                |
| --------------------- | -------------------------------- | ------------------------------------ |
| `VITE_API_BASE_URL` | `http://localhost:8000/api/v1` | Change if the backend runs elsewhere |

## Test

The backend has a starter `pytest` suite covering auth (register/login/`me`,
password rules, case-insensitive emails), the deterministic scoring formulas, the
mock AI's keyword classification, and the dashboard's empty state, recommendation
choice and readable narratives, and UTC timestamps in API responses.
Tests run against a throwaway SQLite database, so your dev `ilc.db` is never touched:

```
cd backend
.venv/Scripts/python.exe -m pip install -r requirements-dev.txt   # Windows
.venv/Scripts/python.exe -m pytest
```

Coverage is still thin — updates, extraction, and most intelligence endpoints are
verified manually with real requests (see `_docs/learning/` for the exact commands
and outputs from each phase). Use the same approach to sanity-check the backend
after a change:

```
# from backend/, with the server running on :8000

# 1. Register + capture the token
curl -s -X POST http://127.0.0.1:8000/api/v1/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"you@example.com","password":"secret123"}'
# copy the access_token from the response into $TOKEN below

# 2. Confirm the token works
curl -s http://127.0.0.1:8000/api/v1/auth/me -H "Authorization: Bearer $TOKEN"

# 3. Post an update and see the extracted events
curl -s -X POST http://127.0.0.1:8000/api/v1/updates \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"content":"Worked on my project for 3 hours. Skipped the gym, felt tired."}'

# 4. Check the dashboard
curl -s http://127.0.0.1:8000/api/v1/dashboard -H "Authorization: Bearer $TOKEN"
```

The frontend has a starter [Vitest](https://vitest.dev) suite in `frontend/tests/`
covering the API client (auth header, error handling, 204s), the
`ProtectedRoute` login redirect, the Dashboard's "—" empty state and JDC guide, the
Updates page's date-wise history (grouping, day chips, date picker), and the date
helpers (local days, Today/Yesterday, streaks). It runs in a simulated browser (jsdom) with
`fetch` mocked, so the backend doesn't need to be running:

```
cd frontend
npm test              # run once
npm run test:watch    # re-run on file changes
npm run build         # type-check (including tests) + production build
```

This does **not** verify the real UI in a browser — there's no browser automation
set up in this repo. Manually click through `npm run dev` →
`http://localhost:5173` after any frontend change.

Planned for the "Polish" roadmap phase: broader `pytest` coverage for the backend
(remaining services and API routes), more Vitest page tests, and Playwright for
end-to-end browser tests.

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
8. **Polish** — automated tests (pytest/vitest), Alembic migrations, Postgres in
   Docker, richer dashboard UX

## License

[Unlicense](LICENSE) — public domain.
