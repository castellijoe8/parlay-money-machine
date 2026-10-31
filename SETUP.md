# Project setup

## Local development

Use Node 24 and npm. From this checkout:

```sh
npm ci --cache /tmp/parlay-npm-cache
cp .env.example .env.local
```

Fill `.env.local` privately, or enter values in the cloud environment settings.
Do not overwrite an existing `.env.local`. Never commit keys or paste them into chat.

| Variable | Source |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | `https://ffclankljhsqdxirqjwi.supabase.co` (confirm in Supabase project settings) |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Supabase Settings → API Keys → publishable key |
| `SUPABASE_SECRET_KEY` | Supabase Settings → API Keys → secret key, server only |
| `ODDS_API_KEY` | The Odds API account dashboard, server only |
| `CRON_SECRET` | A private random value of at least 32 bytes, server only |

Generate the cron secret locally with `openssl rand -hex 32` and save it privately.
The browser needs the real publishable key; a proxy placeholder cannot substitute
for a value embedded into client JavaScript. Keep server keys out of `NEXT_PUBLIC_` variables.

```sh
npm run lint
node --experimental-strip-types --test tests/cron-auth.test.mjs
npx tsc --noEmit
npm run build
npm run dev -- --hostname 0.0.0.0
```

The cloud configuration draft lists the project API, Odds API, and Google Fonts
hosts (the app imports a Google font). Review and save the draft in environment
settings, supply missing values securely, then publish the environment. Saving a
draft alone does not update the running machine or deploy the application.

## Existing Supabase database

Run `supabase/audit.sql` in the existing project's SQL Editor. It is read-only.
Review the output before creating or altering anything. The app requires:

- `profiles`: `id`, `display_name`; names are unique and 3–20 characters.
- `games`: `id`, `external_id`, `sport`, `starts_at`, `away_team`, `home_team`,
  `status`, `home_score`, `away_score`, `spread`, `spread_home`,
  `spread_odds_away`, `spread_odds_home`, `total`, `total_odds_over`,
  `total_odds_under`, `moneyline_away`, `moneyline_home`.
- `picks`: `id`, `game_id`, `user_id`, `user_name`, `pick`, `bet_type`, `line`,
  `odds`, `units`, `result`, `created_at`, with relationships to games and users.
- `sync_state`: `key`, `last_run_at`, with rows keyed `odds` and `scores`.
- `score_game(game_id_input)`: repeatable scoring for spread, total, and moneyline;
  results `pending`, `win`, `loss`, `push`; service-role execution only.

Enable RLS on each table. Users can edit their own profiles and insert their own
picks; clients must not set final results or write games/sync state. A database
trigger must enforce kickoff cutoff and validate picks/odds independently of the
browser. Check unique user/game picks. The frontend inserts title-case bet types,
while some displays compare lowercase: confirm the database normalizes them.
Do not replace existing policies or scoring logic without reviewing the audit.

## Authentication

In Supabase Authentication, enable email/password. Configure Site URL for the
production app and allow the development and production redirect URLs you use.
Keep confirmation emails enabled if required, configure production SMTP, and test
signup → email confirmation → login → profile → logout with a test account.

## Vercel deployment and jobs

Connect the repository to your Vercel project and set all five variables there
as well. Rebuild after changing public variables. Confirm your plan accepts
`vercel.json`: some jobs run more than once daily, which exceeds Hobby cron
frequency limits. Adjust the schedule or plan deliberately before deploying.

Vercel supplies `Authorization: Bearer <CRON_SECRET>` to scheduled jobs when
`CRON_SECRET` is configured. All three maintenance routes now require that exact
header, including manual `/api/backfill-scores` requests. Requests with no valid
token return 401; missing server secret returns 503, with no database access.

The schedules are UTC: daily games/scores at 16:00, additional weekend runs at
22:00, and an extra score check Monday at 06:00. Pacific times shift with daylight
saving. The throttles in `lib/sync-schedule.ts` do not create additional jobs.

After credentials and schema checks pass, import games before scores, then test
a pick before kickoff and confirm completed-game scoring and leaderboard units.
These actions write data and consume API quota. Backfill processes all final games;
confirm scoring is repeatable before running it. Cron configuration takes effect
on deployment; preparing this checkout does not deploy it.
