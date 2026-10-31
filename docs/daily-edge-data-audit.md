# Daily Edge v1 data audit

## Reporting window

The feed uses a Monday-to-Monday calendar week in `America/Los_Angeles`. The start is inclusive and the following Monday is exclusive, so daylight-saving changes do not shift the local reporting boundary.

## Feature sources and limits

| Feature | Source | Limits |
| --- | --- | --- |
| NFL and college schedule / current odds | Existing The Odds API live odds endpoint, ingested by `/api/sync-games` into `public.games` | Depends on `ODDS_API_KEY` and the existing sync schedule. The configured `americanfootball_ncaaf` key is used; the separate FCS sport key is not requested. |
| Final scores and team form | `public.games` populated by the existing odds and score sync routes | Uses completed rows with non-null scores; bounded to the latest 1,500 per sport. College results are limited to the active season beginning August 1 to exclude pre-separation seasons that may have included FCS. Not an injury, roster, or news source. |
| ATS and totals records | `game_odds_snapshots` (new migration) plus final scores from `public.games` | Starts only after the migration is applied and new sync observations accumulate. Uses the latest captured pregame line from each available sportsbook; it may differ from the closing line. Games without an observed line are excluded. Pushes are counted separately. |
| Current sportsbook lines | The latest pregame snapshot for each sportsbook in `game_odds_snapshots` | Only sportsbooks and markets returned by the existing provider response are represented. The existing `games` line columns hold one current representative book and are not treated as historical data. |
| Line movement | Earliest and latest pregame snapshots per sportsbook and market, exposed by `game_odds_snapshot_edges` | The earliest snapshot means the earliest observation collected by this app, not the true market opening line. Movement cannot be backfilled from the current feed; The Odds API historical endpoint is a paid-plan feature and is not used. |
| Head-to-head | Final game rows in `public.games` | Limited to available stored history and the most recent five meetings. Historical matchups are descriptive, not predictive. |
| Explanations | Deterministic, sourced summaries (user-approved fallback) | No AI provider is configured. `lastAiGenerationAt` is therefore null. Enabling generated explanations later requires an approved provider and budget. |

## Operations

Apply `supabase/migrations/20261030000000_daily_edge_odds_snapshots.sql` to the linked Supabase project before expecting odds-based insights. Until then, the existing odds and score ingestion remains functional, and Daily Edge displays recent-score insights with an odds-history-unavailable explanation. Snapshot collection reuses the current provider response and makes no additional provider calls.

The weekly endpoint is `GET /api/daily-edge`; matchup details are available with `GET /api/daily-edge?gameId=<game UUID>`. Both use the server-side Supabase service key and do not expose the snapshot table to browser roles. The daily trend refresh is `GET /api/daily-edge/refresh`, scheduled at 17:00 UTC, and records each run in `daily_edge_runs`. It also supports an authenticated manual `POST` to that path with `Authorization: Bearer $CRON_SECRET`. `CRON_SECRET` is configured as an encrypted Vercel environment variable for production, preview, and development. Existing Vercel schedules refresh games daily with additional weekend odds syncs, and add weekend / Monday score checks; odds collection follows those existing schedule and provider throttles. No additional odds endpoint calls are made for Daily Edge.

Repeated odds sync responses are idempotent: the snapshot table deduplicates identical outcomes and provider timestamps. Trend calculations are recomputed from stored data, so repeated refresh runs do not create duplicate nuggets. `daily_edge_runs` records trend refresh status; `system_job_runs` records odds and score sync outcomes; the existing `sync_state` timestamps are included in the API health metadata. AI generation is disabled by design; the deterministic explanation remains available.

Local validation uses the built-in Node test runner with TypeScript stripping (Node 22.6 or later). `npm test`, `npm run lint`, `npx tsc --noEmit`, `npm run build`, and `git diff --check` cover calculations and code quality. Manual authenticated database and provider failure checks still depend on configured Vercel/Supabase credentials.
