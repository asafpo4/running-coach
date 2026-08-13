# AI Running Coach

A personalized AI running coach: set a goal, connect Strava, get an
adaptive training plan that syncs to your Google Calendar, and a
witty/sarcastic coaching chat that knows your actual schedule. Runs on
free tiers (Vercel Hobby + Supabase Free + Gemini free tier) — see the
Strava cost note below, that one's no longer fully free.

## Stack

- **Next.js 16** (App Router, TypeScript, Tailwind) — frontend + API routes
- **Supabase** — Postgres (free tier) + Auth (email magic link + Google OAuth)
- **Prisma 7** — schema/migrations, with the `@prisma/adapter-pg` driver
  adapter (pooled connection at runtime, direct connection for migrations)
- **Gemini API** (`@google/genai`) — the coach engine (plan generation +
  persona chat), calls wrapped with retry/backoff since the free tier
  returns transient 503/429s under load
- **Strava API** — primary fitness data source (Garmin auto-exports to
  Strava; see note below on why we don't hit Garmin directly)
- **Google Calendar API** — pushes each planned workout as an all-day event

## Status — all 4 phases built

- **Phase 0** — auth, DB schema, Strava OAuth connect/callback, persona chat
  API round trip.
- **Phase 1** — goal-setting form (`/goals/new`, distance/time fields, pace
  derived rather than freeform text), dashboard goal summary, chat UI
  (`/chat`) with goal-aware persona.
- **Phase 2** — Strava activity sync (token refresh, 90-day lookback,
  reconciles deletions so edits/removals on Strava's side don't leave stale
  ghost records) reachable from the dashboard, and adaptive plan generation
  (`/plan`): Gemini gets the goal, recent synced activities (including heart
  rate, weighed against pace, not just logged), and adherence to the
  previous plan, and returns a structured (JSON-schema-constrained) 7-day
  plan. A user only ever has one active plan regardless of how many goals
  they've had — regenerating always retires whatever plan was previously
  active.
- **Phase 3** — Google Calendar OAuth connect (`/api/calendar/connect`),
  auto-syncs the active plan's workouts as calendar events whenever a plan
  is (re)generated, and cleans up a retired plan's still-upcoming events
  first. The chat persona also gets today's actual date and the plan's
  day-by-day schedule (DONE/MISSED/upcoming, computed from data — never left
  for the model to infer or guess from wording).

Note on scheduling: sync and plan generation are both user-triggered
(buttons), not on a background cron — keeps everything running on free
tiers with zero extra infrastructure. Vercel Hobby does support a daily
cron job if you want to automate the sync later.

## Strava now costs money (found this out mid-build)

As of June 2026 Strava paywalled API access — a small app like this one
needs the developer (not each connecting friend) to have an active paid
Strava subscription for the Standard Tier. Friends connecting their own
Strava account via OAuth don't need their own subscription; only the
account tied to the app's Client ID/Secret does. A free trial + cancel
covers development and testing without ongoing cost, but running this for
real, long-term, means either paying monthly or falling back to manual
activity entry (not built).

## One-time setup (all free)

1. **Supabase** — create a project at [supabase.com](https://supabase.com).
   - Project Settings -> Database -> Connection string: copy the **pooled**
     connection (port 6543) into `DATABASE_URL`, and the **direct**
     connection (port 5432) into `DIRECT_URL`.
   - Project Settings -> API: copy the Project URL and anon key into
     `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY`, and the
     service role key into `SUPABASE_SERVICE_ROLE_KEY` (server-only, never
     expose to the browser).
   - Authentication -> Providers: enable **Google** and add your OAuth
     client id/secret (from Google Cloud Console, step 4 below — the same
     client covers both Google sign-in and Calendar) if you want Google
     login; email magic links work out of the box.
   - Authentication -> URL Configuration: **Site URL** must be your app's
     origin (`http://localhost:3000` for dev), and **Redirect URLs** needs
     `http://localhost:3000/**` added. Without this, Supabase silently
     falls back to the Site URL instead of `/auth/callback` and login
     breaks with no obvious error — this bit us once.

2. **Gemini API key** — [aistudio.google.com/apikey](https://aistudio.google.com/apikey),
   copy into `GEMINI_API_KEY`. Free tier, no billing account needed.

3. **Strava API** — [strava.com/settings/api](https://www.strava.com/settings/api),
   create an app (requires an active Strava subscription now — see cost
   note above). Set the "Authorization Callback Domain" to `localhost` for
   dev. Copy client id/secret into `STRAVA_CLIENT_ID` / `STRAVA_CLIENT_SECRET`.

4. **Google Cloud OAuth client** — [console.cloud.google.com](https://console.cloud.google.com):
   - APIs & Services -> Library: enable **Google Calendar API**
   - APIs & Services -> OAuth consent screen: External user type; under
     **Scopes** add `.../auth/calendar.events`; under **Test users** add
     every Gmail address that should be able to sign in (the app isn't
     verified, so only listed accounts work — up to 100)
   - APIs & Services -> Credentials -> Create OAuth client ID (Web
     application), with **two** authorized redirect URIs:
     `https://<your-supabase-project-ref>.supabase.co/auth/v1/callback`
     (Supabase sign-in) and `http://localhost:3000/api/calendar/callback`
     (our own Calendar sync)
   - Copy the Client ID/Secret into both `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET`
     *and* Supabase's Google provider settings (step 1)

5. Copy `.env.example` to `.env` and fill in all the values above.

6. Push the schema and create the auth-sync trigger:

   ```bash
   npx prisma migrate dev --name init
   ```

   Then open the Supabase SQL Editor and run
   [`supabase/sync-user-trigger.sql`](./supabase/sync-user-trigger.sql) once
   — it keeps `public.users` in sync with Supabase's `auth.users` whenever
   someone signs up.

7. Run the dev server:

   ```bash
   npm run dev
   ```

   Visit [http://localhost:3000/login](http://localhost:3000/login).

## Why Strava instead of Garmin directly

Garmin has no simple consumer OAuth API — the official Health/Training API
requires a business partner agreement, and unofficial libraries log in with
the user's actual Garmin password (ToS risk, can break anytime). Garmin
Connect can auto-export every activity to Strava, and Strava has a real
public OAuth API. `src/lib/providers/fitness-provider.ts` defines a
provider-agnostic interface so a Garmin implementation can be added later
without touching the rest of the app.

## Deploying (still free, Strava subscription aside)

- Push to GitHub, import the repo on [Vercel](https://vercel.com) (Hobby
  plan), add all the same env vars in the Vercel project settings.
- Update `STRAVA_REDIRECT_URI`, `GOOGLE_REDIRECT_URI`, and
  `NEXT_PUBLIC_APP_URL` to your production URL.
- Add the production URL in every place a `localhost:3000` URL was
  registered during setup: the Strava app's callback domain, the Google
  OAuth client's authorized redirect URIs (both the Supabase callback and
  `/api/calendar/callback`), and Supabase's Redirect URLs allow-list
  (`https://your-app.vercel.app/**`).
