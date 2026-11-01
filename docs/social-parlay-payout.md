# Social parlay house payout rules

## Final behavior

A compatible same-game parlay can now be priced, placed, stored and settled. Each
game has one side slot (spread OR moneyline) plus one total slot (Over OR Under).
The prior compatibility rules remain enforced in the browser, API and database;
separate singles and other parlays never consume those slots.

The approved house convention multiplies every leg's decimal odds and risks one
unit. It is a defined social-game payout, not a calibrated estimate of joint win
probability or a sportsbook's SGP quote. The slip, history and shared templates
state that distinction. Mixed same-game/cross-game parlays use the same convention.

American odds convert as follows:

- Positive A: decimal odds = 1 + A / 100.
- Negative A: decimal odds = 1 + 100 / abs(A).
- Total return = round(1 unit × product of decimal odds, 2).
- Profit = total return − 1 unit.

Miami ML −150 plus Over −110 therefore returns **3.18 units**, including **2.18
units profit**. The displayed American equivalent is +218. Intermediate leg prices
are not rounded to cents; return/profit are rounded at the end.

New parents containing a same-game group store pricing method
`house_decimal_product_v1`. Independent-game-only parents retain
`independent_games`. Accepted odds, lines and method remain frozen at placement.
The existing legacy estimate flag is not reused to present house rules as an
estimated market price. Historical wagers are neither repriced nor relabeled.

## Creation and settlement

The authenticated API supplies user identity; the SQL creation function locks games,
validates current odds, sport, lines and compatibility, recalculates the payout and
saves parent/legs atomically. Retry keys remain per-user and cannot create a second
wager on a network retry. Client-submitted combined prices and stake are ignored.

- Any loss loses the parent, including before other legs finish.
- Pending legs prevent a win.
- Push/void legs contribute a factor of 1, removing their price.
- All push/void outcomes refund the single original stake.
- House settlement uses the frozen American odds at full numeric precision, not
  updated game odds or truncated leg decimals.
- Existing independent/legacy settlement conventions remain unchanged.
- Each parent still contributes one record; legs never become separate wagers.

## SQL rollout — production approval required

No production schema change or deployment has been performed for this update.

After approval:

1. Open https://supabase.com/dashboard/project/ffclankljhsqdxirqjwi/sql/new and verify
   project reference **ffclankljhsqdxirqjwi** (production).
2. Choose SQL Editor → New query; use Primary Database / postgres if selectors appear.
3. Copy **all** of `supabase/migrations/20261101020000_social_parlay_payout.sql`, from
   `begin;` through `commit;`, into the editor. This file is the exact SQL to paste.
   Click Run. Expected: **Success. No rows returned.**
4. Open another new query, paste all of `supabase/validate-social-parlay-payout.sql`
   and click Run. Expected: **one row with all seven columns true**. The validation
   uses JSON and function definitions, never test wagers in production.
5. Return the validation row. If an error occurs, stop and share its message and
   line number. Do not remove tables or deploy the UI until it is resolved.
6. Preview-test and deploy only after production approval.

Only the new `20261101020000` migration is needed for this follow-up. It includes
the compatibility helper from `20261101010000`, so that intermediate follow-up does
not need to be run separately. The earlier `20261101000000_complete_wagering.sql`
is already applied from the prior production release and is a prerequisite.

The new migration replaces functions only, preserving stored wagers, accepted
prices, relationships, RLS and execute grants. Reapplication is tested. It never
settles or creates production wagers while being installed. A preview built before
SQL installation will show a migration-required error if a same-game submission
reaches the old database guard; it will not silently place an incorrectly labeled
wager.

## Verification and files

Unit/database tests execute actual PostgreSQL migrations locally, including the
Miami example, frozen prices, both teams/sports, mixed parlays, pushes/voids,
settlement retry, idempotent creation, migration reapplication and parent accounting.
Browser tests exercise real application routes with an isolated PostgreSQL-backed
Supabase fixture, including placement and history labels for overlapping singles
and same-game house parlays. No production records are used by these tests.

Run `npm test`, `npm run lint`, `npx tsc --noEmit`, `npm run build`,
`git diff --check`, and `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium npm run test:e2e`.

Key files: `lib/betting.ts`, `lib/wager-api.ts`, `app/page.tsx`,
`app/wagers/page.tsx`, shared-parlay API/page, the new migration and validation SQL,
and the unit/database/browser tests. Homepage Insights removal and one-side/one-total
validation from the preceding commit remain included in this feature branch.

## Mobile leaderboard and filters

Leaderboard records and units use nonwrapping tabular numerals, with shared
column widths sized to the largest displayed record. Long names truncate instead
of pushing records onto another line. Existing desktop win-percentage/streak
columns remain. Compact tablet navigation prevents header overflow.

Sport buttons (All / NFL / NCAAF) and wager-type buttons (All bets / Singles /
Parlays) work together. Parlays read parent records only, so a three-leg win
counts once. Mixed-sport parents appear once in All, and once when either of
their constituent sports is selected. The filter needs no additional schema change.

Browser tests seed only the isolated database and verify 124–46–7 overall,
1–1–1 for parlays, NFL/parlay and NCAAF/parlay subsets, 123–45–6 for singles,
and no record wrapping or horizontal page overflow at 320, 360, 390, 768 and
1280 pixels.
