# JDC frontend

React + TypeScript + Vite. Talks to the [backend](../backend) at
`VITE_API_BASE_URL` (see `.env.example`), defaulting to
`http://localhost:8000/api/v1`.

## Run locally

```
npm install
npm run dev
```

Requires the backend running at the same time (see `backend/README.md`... —
for now, `cd ../backend && .venv/Scripts/python.exe -m uvicorn app.main:app --port 8000`).

## Structure

```
src/
├── api/          fetch client + TypeScript types matching the backend schemas
├── context/       auth state (JWT in localStorage)
├── components/     shared UI (nav bar, route guard)
└── pages/            Login, Signup, Onboarding, Updates, Dashboard
```
