# ILC — AI Life Intelligence Platform

A personal life intelligence application. Users write natural-language updates about
their lives; the system converts those updates into structured events, tracks life
across seven categories, and generates evidence-backed daily, 7-day, and 30-day
insights, trends, scores, recommendations, and short-term forecasts.

> Status: early scaffolding. This repository is being built incrementally, phase by
> phase — see [Roadmap](#roadmap) below.

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

## Planned architecture

- **Backend:** FastAPI (modular monolith), PostgreSQL, Redis + background workers
- **Frontend:** React
- **AI:** Provider-agnostic LLM abstraction; LangGraph reserved for genuinely
  stateful multi-step workflows (intelligence generation), not simple operations
- **Deterministic vs. AI split:** the backend calculates numbers (counts, percentages,
  totals, trends); the LLM interprets what they mean

Full product context lives in [`_docs/`](_docs/).

## Roadmap

Development proceeds in phases, each landing as its own set of commits:

1. **Foundation** — repo, Docker, Postgres, FastAPI, React, CI, auth
2. **Onboarding** — profile, goals, categories, initial Life Profile
3. **Updates** — natural-language update capture, timeline, search
4. **Event extraction** — LLM-based structured event extraction + manual correction
5. **Intelligence engine** — daily / 7-day / 30-day summaries, scores, evidence
6. **Forecasting** — 7-day and 30-day outlooks with confidence and assumptions
7. **Web intelligence** — context-triggered research with source citations
8. **Dashboard & polish** — the unified intelligence dashboard, evidence drawer

Explicitly out of scope for MVP: voice input, yearly memory, long-range predictions,
medical/financial diagnosis, notifications, sharing/export, third-party integrations,
a general-purpose chat interface.

## License

[Unlicense](LICENSE) — public domain.
