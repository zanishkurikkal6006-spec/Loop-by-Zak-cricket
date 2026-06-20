# Loop by Zak Cricket

A multi-tenant **cricket academy management platform** for the UAE. One login,
three roles, one source of truth for attendance, 1-on-1 coaching, AI-written
parent reports, match evidence records, badges and finance.

> Built for serious coaches — professional and premium, **not** a kids' app.
> WhatsApp is the parent communication channel throughout.

## Roles (same login, different destinations)

| Role | Sees |
|---|---|
| **Admin** | Full operations **and** finance — players, packages, payments, attendance confirmation, finance, programs, badges. |
| **Head Coach** | Development oversight across **all** coaches — reports, matches, rankings, badges. **No finance/operations.** |
| **Coach** | Own assigned groups — attendance, 1-on-1 blocks, AI reports, match logging, match-fee collection, rankings. |

## Tech stack

- **React 18 + Vite + TypeScript** + **Tailwind CSS** (design tokens from the brand book).
- **Supabase** — Postgres + Auth + Storage + Edge Functions.
- **Anthropic API** for AI report writing — called **only** from a Supabase Edge
  Function (`generate-report`) so the API key is never exposed to the browser.
  **Currently runs in free placeholder mode**: `src/lib/ai.ts` returns realistic
  sample reports/scorecards so the whole flow is testable with no key or cost.
  To go live, flip `USE_REAL_AI` to `true` in `src/lib/ai.ts` and set
  `ANTHROPIC_API_KEY` as an edge-function secret — no UI or flow changes. The
  AI features (per-session quick feedback, end-of-block development reports,
  CricHeros scorecard reading) all route through that one swap point.
- **WhatsApp** via **click-to-send** today (the app composes the message and opens
  WhatsApp pre-filled). Structured behind a templates module + `outbound_messages`
  log so it can upgrade to the official WhatsApp Business API without touching the UI.
- **Vercel** for frontend hosting.
- `xlsx` (Excel export), `recharts` (finance charts), TanStack Query + Zustand.

## Multi-tenancy (from day one)

Every table carries an `academy_id`. **Row Level Security** is enabled on every
table so each academy only ever sees its own data — enforced in Postgres, not the
app. Finance tables additionally deny read access to coach/head-coach roles. The
RLS helper `auth.user_academy_id()` reads the signed-in user's academy from
`profiles`. See `supabase/migrations/`.

## Project structure

```
src/
  components/
    brand/         LoopMark, LoopRing, RingAvatar — the signature gold ring
    ui/            Buttons, cards, chips, modals, toasts
  features/        one folder per domain (attendance, reports, finance, …)
  layouts/         role-based shells (admin / head-coach / coach)
  lib/             supabase client, types, whatsapp, utils
  pages/           top-level routed screens
supabase/
  migrations/      schema + RLS + seed (numbered, run in order)
  functions/       edge functions (generate-report)
_designs_review/   the original design handoff (visual source of truth)
```

## Getting started

```bash
npm install
cp .env.example .env.local   # fill in your Supabase project values
npm run dev
```

### Supabase setup

1. Create a project at [supabase.com](https://supabase.com).
2. Apply migrations (in order) from `supabase/migrations/` via the SQL editor or
   the Supabase CLI (`supabase db push`).
3. Set edge-function secrets (never exposed to the client):
   ```bash
   supabase secrets set ANTHROPIC_API_KEY=sk-ant-...
   supabase functions deploy generate-report
   ```
4. Put `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` in `.env.local`.

### Deploy (Vercel)

Connect the repo to Vercel, set the `VITE_*` env vars, and deploy. Build command
`npm run build`, output `dist/`.

## Scripts

| Command | Description |
|---|---|
| `npm run dev` | Start the Vite dev server |
| `npm run build` | Type-check and build for production |
| `npm run preview` | Preview the production build |
| `npm run lint` | Lint |
| `npm run typecheck` | Type-check only |

## Design source of truth

The original design handoff (HTML/CSS prototypes + brand book) lives in
`_designs_review/design_handoff_loop/`. Colors, type, spacing and component
behaviour are recreated from there. **Brand Red `#9C1116` · Gold `#C9A84C` ·
Ink `#141414` · Paper `#FAF7F4`** · Bebas Neue (display) + Jost (UI).
