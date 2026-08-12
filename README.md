# AI Running Coach

A personalized AI running coach: set a goal, connect Strava, get an
adaptive training plan and a witty/sarcastic coaching chat. Built to run on
entirely free tiers (Vercel Hobby + Supabase Free + Gemini free tier +
Strava API).

## Stack

- **Next.js 16** (App Router, TypeScript, Tailwind) — frontend + API routes
- **Supabase** — Postgres (free tier) + Auth (email magic link + Google OAuth)
- **Prisma 7** — schema/migrations, with the `@prisma/adapter-pg` driver
  adapter (pooled connection at runtime, direct connection for migrations)
- **Gemini API** (`@google/genai`) — the coach engine (plan generation +
  persona chat)
- **Strava API** — primary fitness data source (Garmin auto-exports to
  Strava; see note below on why we don't hit Garmin directly)

## Status

- **Phase 0** — auth, DB schema, Strava OAuth connect/callback, persona chat
  API round trip.
- **Phase 1** — goal-setting form (`/goals/new`), dashboard goal summary,
  chat UI (`/chat`) with goal-aware persona.
- **Phase 2** — Strava activity sync (with token refresh) reachable from the
  dashboard, and adaptive plan generation (`/plan`): Gemini gets the user's
  goal, recent synced activities, and adherence to the previous plan, and
  returns a structured (JSON-schema-constrained) 7-day plan. Calendar sync
  is Phase 3, not built yet.

Note on scheduling: sync and plan generation are both user-triggered
(buttons), not on a background cron — keeps everything running on free
tiers with zero extra infrastructure. Vercel Hobby does support a daily
cron job if you want to automate the sync later.

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
     client id/secret (from Google Cloud Console) if you want Google login;
     email magic links work out of the box.

2. **Gemini API key** — [aistudio.google.com/apikey](https://aistudio.google.com/apikey),
   copy into `GEMINI_API_KEY`. Free tier, no billing account needed.

3. **Strava API** — [strava.com/settings/api](https://www.strava.com/settings/api),
   create an app. Set the "Authorization Callback Domain" to `localhost`
   for dev. Copy client id/secret into `STRAVA_CLIENT_ID` /
   `STRAVA_CLIENT_SECRET`.

4. **Google Calendar API** (Phase 3, wire up later) —
   [console.cloud.google.com](https://console.cloud.google.com), enable the
   Calendar API, create an OAuth client, copy id/secret into
   `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`.

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

## Deploying (still free)

- Push to GitHub, import the repo on [Vercel](https://vercel.com) (Hobby
  plan), add all the same env vars in the Vercel project settings.
- Update `STRAVA_REDIRECT_URI`, `GOOGLE_REDIRECT_URI`, and
  `NEXT_PUBLIC_APP_URL` to your production URL, and add that URL to the
  Strava app's callback domain and the Google OAuth client's authorized
  redirect URIs.
