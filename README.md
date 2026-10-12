
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
   same request, synchronously. Each event's description is tidied into a clean
   sentence (typos, casing, "and also" openers) while the update keeps the exact
   words typed. If AI extraction fails, the update itself is still safely saved.
   Editing the update (`PATCH /updates/{id}`) re-extracts its events from the new text
   (extraction runs first, so a failure keeps the old events); `DELETE /updates/{id}`
   removes the update and all its events.
4. **Correct an event** (`PATCH /events/{id}`) → fixes a wrong category/type/
   description/sentiment and flags it `is_corrected`; `DELETE /events/{id}` removes one that
   shouldn't exist.
5. **View intelligence** (`GET /intelligence/daily|weekly|monthly`,
   `GET /dashboard`, `GET /intelligence/forecast`) → on each request, the backend
   pulls the relevant `Event` rows for the time window, computes scores/trends/
   evidence/warnings deterministically, then makes one AI call to phrase a
   narrative, a recommendation, and any warnings in plain language. Nothing derived
   is stored, so every edit or deletion is reflected on the next request.
6. **Ask JDC** (`POST /assistant/ask`) → a LangGraph agent answers questions about
   the journal using read-only tools over the user's data, citing entries; see
   [Ask JDC](#ask-jdc-agentic-rag-over-your-journal) below.

### The AI provider abstraction

`app/ai/providers/base.py` defines one interface (`AIProvider`) with two methods:
`extract_events(text)` and `generate_narrative(kind, context)`. Nothing else in the
codebase talks to a specific AI vendor — the extraction service, onboarding, and the
intelligence engine only ever depend on this interface. The implementations:

- **`MockProvider`** (default, `AI_PROVIDER=mock`) — no API key needed. Deterministic,
  rule-based: keyword-matches sentences to categories, regex-extracts
  amounts/durations, and picks sentiment from small positive/negative word lists.
  Statements are tidied by rule (`app/ai/text_polish.py`: one-letter typo fixes,
  casing, "and also" openers) — real grammar fixes need an LLM provider.
  Good enough to make the whole app runnable and demoable with zero setup.
- **`OpenAIProvider`** (`AI_PROVIDER=groq` or `openai`) — calls any OpenAI-compatible
  Chat Completions API (Groq's free API or OpenAI) directly over HTTP (`httpx`, no
  vendor SDK), asking for JSON-formatted responses. It rewrites each statement with
  correct spelling and grammar. No other code changes required to switch to it.
- **`FallbackProvider`** wraps the real provider: any failed or rate-limited call
  falls back to `MockProvider`, so the app never loses events to an API error.
  Narratives are cached by their inputs, and only the summary/recommendation use the
  LLM — the 7 forecast lines are formulaic, so templates keep a dashboard load to ~2 LLM calls.

To rebuild the statements of updates saved earlier (e.g. after switching provider):
`.venv/Scripts/python.exe -m app.reextract` (keeps hand-fixed categories).

### Ask JDC: agentic RAG over your journal

`app/ai/assistant.py` answers free-form questions ("When did I last go to the gym?",
"How was my health this week?") from the user's own entries only:

```text
question -> [agent: Groq LLM] --tool call--> [tools] --results--> [agent] -> answer + [#id] citations

  tools:  search_journal   BM25 keyword search (+ date / area filters)   app/services/journal_search.py
          entries_on_date  everything logged on one local day
          area_stats       per-area counts, scores, trends (same formulas as the dashboard)
```

- **LangGraph** runs the loop (`StateGraph`: `agent` node and a `ToolNode`, at most
  ~4 tool rounds); **LangChain-Groq** (`ChatGroq`) is the model, with tool calling.
- **Retrieval is index-free**: each search reads the user's current entries from
  the database and ranks them with BM25 (`rank-bm25`) in memory. A personal journal
  is small, so this is fast, and there is no vector store that could go stale:
  edits and deletions are reflected in the very next answer.
- Cited `[#id]`s are checked against the user's own entries and returned as source
  cards; made-up ids are dropped. Dates use the browser's timezone offset.
- **Day summaries** (`POST /assistant/day-summary`, the *Summarize day* button in
  the history) send one day's entries to the model; results are cached by the
  entries' current text, so an edit or delete produces a fresh summary.
- **Without an LLM** (`AI_PROVIDER` isn't `groq`, no key, or the call fails) both
  degrade instead of erroring: Ask returns the best-matching entries ("search
  only"), and the day summary lists the areas touched.

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
│   ├── alembic.ini                Alembic (database migrations) config
│   ├── migrations/                one file per schema change; applied on startup
│   ├── .env.example             config template — copy to .env
│   ├── tests/                   pytest suite (uses a throwaway SQLite DB)
│   │   ├── conftest.py            test DB setup + `client` fixture
│   │   ├── test_auth.py             register/login/me, password + email rules
│   │   ├── test_metrics.py            score formulas
│   │   ├── test_mock_extraction.py      mock AI keyword classification
│   │   ├── test_dashboard.py            dashboard empty state + readable narratives
│   │   ├── test_text_polish.py            event statements: typo/casing cleanup
│   │   ├── test_ai_providers.py           Groq request, LLM fallback, narrative cache
│   │   ├── test_update_edits.py             editing an update or a single statement
│   │   ├── test_update_delete.py            deleting updates; dashboard re-estimates
│   │   ├── test_assistant.py                Ask JDC: retrieval, LangGraph agent, day summary
│   │   ├── test_account.py                  passwords, reset links, export/delete, Google, rate limits
│   │   ├── test_migrations_and_config.py    migrations match models; SECRET_KEY guard
│   │   └── test_timestamps.py             API timestamps carry an explicit UTC offset
│   └── app/
│       ├── main.py               creates the FastAPI app, CORS, runs migrations on startup
│       ├── core/
│       │   ├── config.py           typed settings, read from .env; SECRET_KEY safety check
│       │   ├── security.py         bcrypt + signed tokens (login, reset links, Google state)
│       │   └── rate_limit.py         per-IP / per-user request limits (429)
│       ├── db/
│       │   ├── base.py               SQLAlchemy declarative Base
│       │   ├── session.py            DB engine/connection + per-request session
│       │   └── migrate.py              `alembic upgrade head` on startup (adopts old DBs)
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
│       │   │   ├── openai_provider.py        real LLM provider (Groq / OpenAI)
│       │   │   └── fallback.py                 LLM with rule fallback + narrative cache
│       │   ├── assistant.py              Ask JDC: LangGraph agent + tools, day summaries
│       │   ├── text_polish.py            rule-based statement tidy-up (mock provider)
│       │   └── factory.py                get_ai_provider() — picks a provider from .env
│       ├── services/                Business logic (no HTTP concerns here)
│       │   ├── event_extraction.py    runs AI extraction, persists Event rows,
│       │   │                            re-extracts edited updates keeping fixes
│       │   ├── metrics.py               deterministic counts + score formulas
│       │   ├── forecasting.py             trend classification (compute_trend)
│       │   ├── journal_search.py          BM25 search over a user's entries (RAG retrieval)
│       │   ├── email.py                   SMTP sender (logs the message when SMTP isn't set)
│       │   └── intelligence.py              orchestrates metrics+AI into summaries,
│       │                                       forecasts, and the dashboard payload
│       └── api/v1/                 HTTP endpoints (thin — delegate to services)
│           ├── router.py             collects every v1 router
│           ├── auth.py                 register/login/me, passwords, export/delete, Google
│           ├── meta.py                   GET /config (public: Google on? outside AI used?)
│           ├── categories.py             GET /categories (the 7 fixed categories)
│           ├── onboarding.py               GET/PUT /onboarding
│           ├── goals.py                      goals CRUD
│           ├── updates.py                      updates create/list/detail/edit/delete (+ extraction)
│           ├── assistant.py                      Ask JDC + day summaries
│           ├── events.py                         manual event correction/deletion
│           └── intelligence.py                     daily/weekly/monthly/forecast/dashboard
│
├── .github/workflows/ci.yml  runs all backend + frontend checks on every push (GitHub Actions)
│
├── frontend/                 React + TypeScript + Vite application
│                               (icons: lucide-react; no emoji — enforced by a test)
│   ├── .env.example             config template — copy to .env.local
│   ├── tests/                   Vitest suite (jsdom, fetch mocked)
│   │   ├── helpers.ts             mockRoutes(): fake API responses by "METHOD /path"
│   │   ├── client.test.ts         API client: auth header, errors, 204s
│   │   ├── account.test.tsx         session expiry, offline, Google, reset, Account page
│   │   ├── Goals.test.tsx             goals: list, add, done/reopen, delete
│   │   ├── Ask.test.tsx               Ask JDC chat
│   │   ├── ProtectedRoute.test.tsx  login redirect
│   │   ├── Dashboard.test.tsx         "—" empty state, real scores, JDC guide
│   │   ├── Updates.test.tsx             date-wise history: grouping, chips, date picker
│   │   ├── dates.test.ts                  day keys, Today/Yesterday, streaks
│   │   └── no-emoji.test.ts                 fails if an emoji appears in src/ or index.html
│   └── src/
│       ├── main.tsx               app entry point (router + auth provider)
│       ├── App.tsx                  route definitions
│       ├── index.css                  all styling: design tokens, light/dark, mobile
│       ├── lib/
│       │   ├── categories.ts            icon + accent color per life area
│       │   ├── dates.ts                   local-day grouping, labels, streak
│       │   └── appConfig.ts                 useAppConfig(): GET /config once
│       ├── api/
│       │   ├── client.ts                fetch wrapper: JWT, errors, expired sessions, downloads
│       │   └── types.ts                   TypeScript types mirroring backend schemas
│       ├── context/
│       │   └── AuthContext.tsx              logged-in user + login/register/logout
│       ├── components/
│       │   ├── ProtectedRoute.tsx             redirects to /login if signed out (retry if offline)
│       │   ├── Feedback.tsx                     LoadError, ErrorBoundary, PrivacyNote, GoogleButton
│       │   ├── NavBar.tsx                       sticky top navigation
│       │   ├── AboutJdc.tsx                       "JDC at a glance": flow diagram + screen map
│       │   ├── CategoryIcon.tsx                     a life area's icon in its accent color
│       │   ├── AuthLayout.tsx                       two-panel login/signup layout
│       │   └── Logo.tsx                               the JDC logo mark
│       └── pages/
│           ├── Login.tsx / Signup.tsx
│           ├── AuthCallback.tsx                   finishes Google sign-in
│           ├── PasswordReset.tsx                  forgot password + reset password
│           ├── Account.tsx                        password, export, delete account
│           ├── Goals.tsx                          goals with this week's activity
│           ├── Onboarding.tsx                     the "Life Profile" form
│           ├── Ask.tsx                              "Ask JDC" chat with cited sources
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
- Node.js 20.19+ or 22.12+ and npm (`node --version`, `npm --version`)
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
server starts, and **migrations run automatically on every start** (Alembic `upgrade
head`), so pulling a change that alters the schema needs no manual step. A database
from before migrations existed is detected and adopted with its data.

For anything other than local use, set `ENVIRONMENT=production` and a long random
`SECRET_KEY` (see [Configuration reference](#configuration-reference)); the server
refuses to start in production with the public default key.

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

1. **Sign up** at `/signup`, or **Continue with Google** (the button appears once
   `GOOGLE_CLIENT_ID`/`SECRET` are set; see [Configuration reference](#configuration-reference)).
   Forgot your password? **Forgot password?** on the login page emails a reset link
   (or, without email set up, prints it in the backend console).
2. **Fill in your Life Profile** at `/onboarding`: a line about yourself, what you
   want to improve, which life areas you care about, and any current challenges.
   Saving generates a short AI summary of it.
3. **Write an update** at `/updates` — e.g. *"Worked on my backend project for 4
   hours. Skipped the gym because I was tired. Spent $800 eating outside. Had an
   argument with my friend."* It's saved immediately, then AI-extracted into
   separate Health/Career/Finance/Relationships events, each shown with its
   category, sentiment, and confidence.
4. **Correct anything the AI got wrong** — change an event's category from the
   dropdown, reword a statement with **Edit**, or remove one that shouldn't exist.
   **Edit update** rewrites the whole paragraph and re-sorts its statements to match. Corrections are tracked
   (`is_corrected`). **Delete** removes an entry with all its statements (after a
   confirmation); the dashboard, history and Ask JDC re-estimate without it.
5. **Look back through your history** — below the update box, entries are grouped
   by day (*Today*, *Yesterday*, then full dates), each day showing which life
   areas it touched. Click a day chip to see just that day, or use **Jump to date**
   to pick any date; **Show all days** returns to the full list. The header shows
   your total entries, days logged, and current daily streak. Days follow your
   local timezone. **Summarize day** under a date asks the AI for a 2-3 sentence
   summary of that day.
6. **Check the dashboard** at `/dashboard` — overall score, per-category scores
   with trend arrows, the week's top observation, any warnings (e.g. repeated
   negative-sentiment events in one category), a recommendation, and a 7-day
   forecast per category. A brand-new account shows **"—"** instead of scores and
   a "log your first update" prompt until there's activity; categories you haven't
   logged anything in yet stay "—". The **JDC at a glance** guide at the top
   shows it visually: a 4-step flow diagram (Write → Split → Sort → See) with an
   example entry transforming at each step, and a mini map of the Dashboard and
   Updates screens labelling where each result appears. It's open for new users
   and collapsed once you have data (**How JDC works** reopens it, and your choice
   is remembered).
7. **Ask JDC** at `/ask`: ask questions about your journal in plain words. Answers
   cite the entries they're based on; click a source to open that day in the history.
   Search also understands related words through life areas: *"workout"* finds
   *"went to the gym"* because both are Health.
8. **Goals** at `/goals`: add goals in a life area, mark them done or archive them.
   Each active goal shows how many entries you logged in its area this week.
9. **Account** (click your name in the top bar): change or set a password, export
   all your data as JSON, or permanently delete your account. Changing the password
   signs you out on other devices.
10. Keep logging updates over multiple days — scores, trends, and forecasts become
   more meaningful as more evidence accumulates (a single day of data will
   correctly show "not enough data" for most trends, by design).

> **Mock provider note:** the default `AI_PROVIDER=mock` classifies each sentence
> by whole-word keywords (so *"run,"*, *"studied"* and *"walking"* are recognised,
> but *"ready"* isn't mistaken for *"read"*). Money verbs like *"spent"* only count
> as Finance when there's an amount (`$`/`₹`) or no duration — *"Spent 2 hours
> studying"* is Learning, *"Spent $800 eating out"* is Finance. Sentences with no
> keyword fall back to Lifestyle. It's still a simple rule-based stand-in; a real
> provider (`AI_PROVIDER=groq` with a free key from https://console.groq.com/keys)
> understands free-form text far better and fixes grammar in the statements.

## API reference

All endpoints below are under `/api/v1` and (except registration/login) require
`Authorization: Bearer <token>`. Full interactive docs with request/response
schemas: `http://localhost:8000/docs`.

Rate limits: login, sign-up and password-reset requests are limited per IP address,
and AI-backed requests (posting/editing updates, Ask JDC, day summaries) per user.
Over the limit, the API returns **429** with a `Retry-After` header.

| Method | Path                                    | Purpose                                                 |
| ------ | --------------------------------------- | ------------------------------------------------------- |
| POST   | `/auth/register`                      | Create an account, returns a JWT                        |
| POST   | `/auth/login`                         | Log in, returns a JWT                                   |
| GET    | `/auth/me`                            | Current user                                            |
| POST   | `/auth/change-password`               | Change (or first set) the password; signs out other sessions |
| POST   | `/auth/forgot-password`               | Email a reset link (same reply whether or not the email exists) |
| POST   | `/auth/reset-password`                | Set a new password from a reset link (single use)       |
| GET    | `/auth/me/export`                     | Download all your data as JSON                          |
| DELETE | `/auth/me`                            | Delete the account and all its data                     |
| GET    | `/auth/google/login`                  | Redirect to Google sign-in (if configured)              |
| GET    | `/auth/google/callback`               | Google returns here; redirects to the app with a token  |
| GET    | `/config` *(no login needed)*         | Public settings: Google sign-in on? outside AI used?    |
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
| PATCH  | `/updates/{id}`                       | Edit an update's text (re-extracts its events)          |
| DELETE | `/updates/{id}`                       | Delete an update and all its events                     |
| PATCH  | `/events/{id}`                        | Correct an event's category/type/description/sentiment  |
| DELETE | `/events/{id}`                        | Remove an incorrect event                               |
| GET    | `/intelligence/daily`                 | 1-day summary: scores, evidence, warnings, narrative    |
| GET    | `/intelligence/weekly`                | 7-day summary                                           |
| GET    | `/intelligence/monthly`               | 30-day summary                                          |
| GET    | `/intelligence/forecast?horizon=7\|30` | Per-category forecast                                   |
| GET    | `/dashboard`                          | Trimmed "3-5 things that matter" view                   |
| POST   | `/assistant/ask`                      | Ask JDC: answer from your entries, with sources         |
| POST   | `/assistant/day-summary`              | AI summary of one local day                             |
| GET    | `/health` *(not under /api/v1)*     | Liveness check                                          |

## Configuration reference

### Backend (`backend/.env`, copy from `.env.example`)

| Variable                                        | Default                                               | Notes                                                              |
| ----------------------------------------------- | ----------------------------------------------------- | ------------------------------------------------------------------ |
| `DATABASE_URL`                                | `sqlite:///./ilc.db`                                | Point at a Postgres URL later — no code changes needed            |
| `ENVIRONMENT`                                 | `development`                                       | Anything else (e.g. `production`) refuses a weak `SECRET_KEY`     |
| `SECRET_KEY`                                  | `dev-only-secret-change-me`                         | Signs login tokens. Public default: set a long random one          |
| `FRONTEND_URL`                                | `http://localhost:5173`                             | Where Google sign-in and reset emails send people back to          |
| `ACCESS_TOKEN_EXPIRE_MINUTES`                 | `10080` (7 days)                                    | JWT lifetime                                                       |
| `CORS_ORIGINS`                                | `http://localhost:5173`                             | Comma-separated list of allowed browser origins                    |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | *(blank)*                                           | Leave blank to disable Google sign-in (returns 501, doesn't crash) |
| `GOOGLE_REDIRECT_URI`                         | `http://localhost:8000/api/v1/auth/google/callback` | Must match the Google Cloud Console OAuth client config            |
| `AI_PROVIDER`                                 | `mock`                                              | `mock` (no key needed), `groq` or `openai`                   |
| `GROQ_API_KEY`                                | *(blank)*                                           | Required only if`AI_PROVIDER=groq`                               |
| `GROQ_MODEL`                                  | `openai/gpt-oss-120b`                               | Any Groq chat model that supports JSON mode                        |
| `OPENAI_API_KEY`                              | *(blank)*                                           | Required only if`AI_PROVIDER=openai`                             |
| `OPENAI_MODEL`                                | `gpt-4o-mini`                                       | Any OpenAI chat-completions-compatible model                       |
| `SMTP_HOST` / `SMTP_PORT` / `SMTP_USER` / `SMTP_PASSWORD` / `SMTP_FROM` | *(blank)* / `587` | Email for reset links; blank = link printed in the backend log |
| `PASSWORD_RESET_EXPIRE_MINUTES`               | `30`                                                | How long a reset link works                                        |
| `RATE_LIMIT_AUTH_PER_MINUTE`                  | `10`                                                | Login / sign-up / reset requests per IP                            |
| `RATE_LIMIT_AI_PER_MINUTE`                    | `20`                                                | AI-backed requests per user                                        |

### Frontend (`frontend/.env.local`, copy from `.env.example`)

| Variable              | Default                          | Notes                                |
| --------------------- | -------------------------------- | ------------------------------------ |
| `VITE_API_BASE_URL` | `http://localhost:8000/api/v1` | Change if the backend runs elsewhere |

## Test

The backend `pytest` suite covers auth and accounts (passwords, reset links,
export/delete, Google sign-in with Google's servers faked, rate limits), the scoring
formulas, AI extraction and fallback, update editing/deleting, Ask JDC (with a
scripted fake model driving the real LangGraph graph), migrations (including a test
that **fails if a model changes without a migration**), and the SECRET_KEY guard.
Tests run against a throwaway SQLite database, so your dev `ilc.db` is never touched:

```
cd backend
.venv/Scripts/python.exe -m pip install -r requirements-dev.txt   # Windows
.venv/Scripts/python.exe -m pytest
```

To sanity-check a running backend by hand:

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

The frontend [Vitest](https://vitest.dev) suite in `frontend/tests/` covers the API
client (expired sessions, offline errors), every page (Dashboard, Updates history,
edit/delete, Ask JDC, Goals, Account, login/sign-up, Google callback, password reset)
and a check that no emoji appears in the UI. It runs in a simulated browser (jsdom)
with `fetch` mocked, so the backend doesn't need to be running:

```
cd frontend
npm test              # run once
npm run test:watch    # re-run on file changes
npm run build         # type-check (including tests) + production build
```

**Continuous integration:** `.github/workflows/ci.yml` runs the backend tests and
the frontend lint, tests and build on every push to `master` and every pull request.
Results appear as a check mark or cross next to each commit on GitHub (the
**Actions** tab has the logs).

These tests don't drive a real browser; click through `npm run dev` →
`http://localhost:5173` after visual changes.

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
8. **Polish** — done so far: automated tests + CI, Alembic migrations, account
   management (password reset, export, delete), rate limits, Goals page. Still to
   do: Postgres in Docker, real-browser end-to-end tests, meaning-based (embedding)
   search

## License

[Unlicense](LICENSE) — public domain.
