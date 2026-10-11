# JDC frontend

React + TypeScript + Vite. Talks to the [backend](../backend) at
`VITE_API_BASE_URL` (see `.env.example`), defaulting to
`http://localhost:8000/api/v1`.

## Run locally

```bash
npm install
npm run dev
```

Requires the backend running at the same time — see the
[root README "Start" section](../README.md#start)
(`cd ../backend && .venv/Scripts/python.exe -m uvicorn app.main:app --port 8000`).

## Test

```bash
npm test              # Vitest, run once
npm run test:watch    # re-run on file changes
npm run build         # type-check (src + tests) + production build
npm run lint          # oxlint
```

Tests run in jsdom with `fetch` mocked, so the backend doesn't need to be running.

## Structure

```text
src/
├── api/          fetch client + TypeScript types matching the backend schemas
├── context/       auth state (JWT in localStorage)
├── components/     shared UI (nav bar, route guard, JDC guide, auth layout, logo, category icon)
├── lib/            category icons/colors, date grouping helpers
└── pages/            Login, Signup, Onboarding, Updates, Ask, Dashboard
tests/            Vitest suite (API client, route guard, dashboard, update history/edit/delete, Ask, dates, no-emoji)
```

## Conventions

- **Icons:** use [lucide-react](https://lucide.dev) line icons, never emoji.
  `tests/no-emoji.test.ts` fails the test run if an emoji appears in `src/` or
  `index.html`.
- **Category styling:** take the icon and accent color from `src/lib/categories.ts`
  (or render `<CategoryIcon category=... />`) so every page stays consistent.
