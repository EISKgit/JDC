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
├── api/          fetch client, typed endpoints (endpoints.ts), types matching the backend schemas
├── context/       auth state (JWT in localStorage); useAuth() in context/auth.ts
├── hooks/         useAsync: load / error / retry for page data
├── components/     shared UI, plus per-feature folders: updates/, goals/, account/, profile/
├── lib/            category icons/colors, dates, public app config, page titles, Ask history,
                    theme (light/dark/system), dashboard time ranges (overview.ts)
└── pages/            Login, Signup, password reset, Google callback, Onboarding,
                    Updates, Goals, Ask, Account, Dashboard
tests/            Vitest suite (every page, API client, dates, no-emoji, axe accessibility);
                    helpers.ts mocks the API
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
- **Talking to the backend:** add a typed function to `src/api/endpoints.ts` and call
  that; never call `api.get/post/...` from pages or components (a test enforces this).
- **Loading page data:** use `useAsync(() => ...)`, which gives `{ data, loading, error,
  retry, setData }`, and render `<LoadError onRetry={retry}>` on error.
- **One job per component:** pages orchestrate; anything with its own state or logic
  (a card, a form section) goes in `components/<feature>/`.
- **Loading states:** show `<PageSkeleton />` (or `variant="grid"`) instead of a
  "Loading..." line. It has `role="status"`, so screen readers hear "Loading".
- **Messages:** errors get `role="alert"`, confirmations `role="status"`, so they are
  announced without moving focus.
- **Colors:** use the CSS tokens in `index.css` (`--text`, `--surface`, `--primary`...).
  Each has a light and dark value; `<html data-theme="light|dark">` (set by the theme
  button, `lib/theme.ts`) overrides the system setting. Colored text is mixed towards
  `--ink-mix` so it keeps WCAG AA contrast in both themes.
- **Accessibility:** `tests/accessibility.test.tsx` runs axe-core over every page; add
  a new page to it. Icon-only buttons need an `aria-label`. On narrow screens, hide
  labels visually (the `clip-path` pattern in `index.css`), never with
  `display: none`, so the control keeps its accessible name.
- **Page changes:** `RouteFocus` moves focus to `<main id="main">` after navigation, and
  a "Skip to content" link is the first Tab stop.
