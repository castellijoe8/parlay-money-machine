# Parlay wagering rollout

The implementation extends `feature/parlay-builder` (abac932), rather than rebuilding
from main. Existing session setup/security changes were preserved; their original
stash remains available. No production database data was changed during development.

## What is implemented

- Market-specific placed states on homepage cards; other markets remain selectable.
- Singles and parlay placement through authenticated APIs with retry keys. A fresh
  deliberate submission may repeat a selection; a network retry cannot duplicate it.
- Shared compatibility rules, plus authoritative SQL validation of sport, selection,
  game status, current price/line and kickoff. Parent and legs persist atomically.
- Independent-game pricing only. The existing Odds API integration supplies separate
  market prices, not combined same-game quotes. Its snapshots are not a fitted joint
  outcome model. Compatible SGP groups can be assembled but cannot be placed without
  reliable pricing. The UI explains this without inventing an estimate. Mixed
  SGP/cross-game slips are also blocked until every group has a reliable quote.
- Pricing method and accepted selections/odds frozen on new parent wagers. Historical
  SGP estimates remain labeled legacy and retain their original settlement convention.
- Retry-safe parent settlement, immediate loss, push/void price reductions, and
  exactly one record per parent in global/friends/history/dashboard summaries.
- Mixed-sport parents count once in All and once in each applicable sport filter.
- Cancellation/permanent-postponement workflow and automatic settlement trigger on
  final score updates. Ordinary postponements are not automatically voided.

## Database access findings

The remote project is `ffclankljhsqdxirqjwi` (production). The service key has REST
access but is not a PostgreSQL or Management API credential. The saved DATABASE_URL
points to the session pooler, but the environment TCP proxy refuses connections
before authentication. No database-password validation was possible. Supabase CLI
is not installed or linked; there is no staging database configured here. Local
migration tests run the actual SQL in isolated PGlite PostgreSQL, with fixture users
and games; browser tests use a local Supabase HTTP adapter backed by that engine.

## MANUAL SUPABASE STEP REQUIRED

1. Open https://supabase.com/dashboard/project/ffclankljhsqdxirqjwi/sql/new . Verify
   the project reference is **ffclankljhsqdxirqjwi**, not another project. This is the
   existing production database; no preview database has been configured.
2. Select **SQL Editor**, then **New query** (or **+**). Use the **Primary Database**
   connection and **postgres** role if the editor offers connection/role selectors.
3. Open `supabase/migrations/20261101000000_complete_wagering.sql` in this branch.
   This file is the exact complete SQL to paste. Copy its entire contents, starting
   with `begin;` and ending with `commit;`, into the new editor query. Do not paste
   a connection URL, password, or API key into the query.
4. Click **Run** once. Expect **Success. No rows returned.** The migration is a
   transaction: it preserves wagers, adds metadata/functions/view/policies, and
   removes only user/game-level single-pick uniqueness. It is safe to re-run.
   Existing production single-wager inserts continue to work through validated RLS.
5. Open a second new query. Copy the complete contents of
   `supabase/validate-wagering.sql` and click **Run**. Expect **one row**, with **true
   in every column**. Send that result back; it contains no credentials.
6. If migration execution reports an error, stop and share the error message and
   line number. Do not deploy the feature or remove tables. The transaction rolls
   back on error. If validation reports false, share the result for diagnosis.

The original `20261031000000_parlay_wagers.sql` is a prerequisite already represented
by the existing production parlay tables/functions. If the new migration reports a
missing parlay table, stop: inspect schema compatibility before running the original
baseline. Do not blindly re-run old schema definitions over an unknown installation.

## Checks and preview

```sh
npm ci --cache /tmp/parlay-npm-cache
npm test
npm run lint
npx tsc --noEmit
# Use bundled Playwright Chromium, or point to a system installation:
PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium npm run test:e2e
npm run build
```

Browser tests start isolated servers on ports 3200 and 54329 with fixture keys;
keep those ports free. They never use production database records. On another
machine install Playwright's browser with `npx playwright install chromium` and
omit the executable override. Production builds use the existing webpack script.

Do not deploy production before the SQL validation and preview functional checks
pass. A branch push may trigger an existing Vercel preview integration; that preview
uses whichever Supabase project its environment settings specify. Do not assume
preview means a staging database. Do not run synthetic wagers against production
just to test preview connectivity.

## Cancellation operation

For a game confirmed canceled or permanently postponed, an operator can POST to
`/api/games/<game UUID>/void`, authenticated with the server's CRON_SECRET bearer
header. JSON body:

```json
{"permanent":true,"reason":"Confirmed permanent cancellation by league"}
```

This records the reason/time in `game_voids`, prevents new wagers, refunds pending
singles as pushes and voids pending parlay legs. Repeated calls do not pay twice.
A lost parent remains lost; a parent cannot win with pending legs. The Odds API
scores feed has no reliable cancellation signal in the current integration, so
absence from the feed is never treated as cancellation. Known canceled/cancelled/
permanently_postponed statuses also void parlay legs when a game is updated.
