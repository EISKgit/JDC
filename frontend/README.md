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
├── context/       auth state (JWT in localStorage); useAuth() in context/auth.ts
├── components/     shared UI (nav bar, route guard, JDC guide, auth layout, logo, category icon,
│                   load errors / error boundary / privacy note / Google button)
├── lib/            category icons/colors, dates, public app config, page titles, Ask history
└── pages/            Login, Signup, password reset, Google callback, Onboarding,
                    Updates, Goals, Ask, Account, Dashboard
tests/            Vitest suite (every page, API client, dates, no-emoji); helpers.ts mocks the API
```

## Conventions

- **Icons:** use [lucide-react](https://lucide.dev) line icons, never emoji.
  `tests/no-emoji.test.ts` fails the test run if an emoji appears in `src/` or
  `index.html`.
- **Category styling:** take the icon and accent color from `src/lib/categories.ts`
  (or render `<CategoryIcon category=... />`) so every page stays consistent.
- **Pages load on demand:** `App.tsx` imports pages with `React.lazy`, so each page is its
  own small download. Add new pages the same way.
- **Tab titles:** call `usePageTitle("Name")` at the top of every page.
