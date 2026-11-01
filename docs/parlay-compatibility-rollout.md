> Pricing policy update: compatible same-game parlays now use the approved social house payout convention. See [social-parlay-payout.md](social-parlay-payout.md) for the final behavior and the single SQL file to apply. The pricing-unavailable discussion below documents the preceding implementation.

# Same-game selection and Insights changes

## Findings and changes

This branch starts from current production main (`f963f86`), which already includes
`feature/parlay-builder` and the prior wager integrity work. Starting over from the
older builder tip would lose those fixes.

The builder already accepts a spread or moneyline plus a total from one game.
The visible placement block is the explicit pricing-unavailable state, not a
one-leg-per-game selection limit. This branch keeps both legs visible, removable
independently, and counted separately, while explaining that they are compatible
but lack a supported quote. New regression tests verify desktop and mobile behavior.

The actual compatibility bug was team-dependent spread/moneyline validation. It
rejected the same team's combination, but missed opposite teams. The centralized
rule now uses normalized game UUIDs and market slots: one side (spread OR
moneyline), plus one total (Over OR Under). Any second side or total is rejected,
regardless of team or insertion order. Exact keys include game, market, selection
and line. Rejected additions preserve the existing slip. UUID casing is normalized
in TypeScript and cast to UUID in SQL to prevent same-game pricing bypasses.

Homepage `DailyEdgePreview` and its import are removed; no empty wrapper remains.
The dedicated `/daily-edge` page, navigation, APIs, data and calculations are intact.
Single-wager placement, one-unit stakes, settlement and parent-only records are unchanged.

## Pricing limitation

The current integration requests individual spreads, totals and moneylines from
The Odds API. It contains no combined SGP quote endpoint, quote records, or
validated correlation model. Historical odds snapshots alone do not establish a
joint outcome distribution. No quote or validated model has been supplied.

Compatible SGP legs therefore remain in the builder, with no fabricated price,
payout, or enabled submission. Cross-game parlays retain standard pricing. Mixed
slips containing an unsupported same-game group also show pricing unavailable.
Successful SGP placement remains blocked until a real quote integration or a
validated joint model is available. The code does not claim this part is complete.

## Production approval and SQL step

**Do not run the migration or deploy production without approval.** No production
schema or wager data was changed for this branch. Preview pushes may automatically
build on Vercel; a preview is not assumed to have a separate database.

After approval:

1. Open https://supabase.com/dashboard/project/ffclankljhsqdxirqjwi/sql/new . Confirm
   the reference `ffclankljhsqdxirqjwi`, the existing production project.
2. Choose SQL Editor → New query. If offered, select Primary Database and postgres.
3. Copy the entire contents of
   `supabase/migrations/20261101010000_parlay_compatibility.sql`, starting with
   `begin;` and ending with `commit;`, paste, and click Run. This file is the exact
   SQL to execute. Expect **Success. No rows returned.**
4. In a second new query, copy all of `supabase/validate-parlay-compatibility.sql`
   and click Run. Expect **one row with all seven columns true**. This check uses
   synthetic JSON input only; it does not create games or wagers.
5. If any query errors, stop and share the error/line number. Do not remove tables
   or run unrelated earlier migrations. The new migration changes validation
   functions only and is transactional and safe to reapply.
6. After validation, test the preview, then deploy only with production approval.

The prerequisite `20261101000000_complete_wagering.sql` was already applied and
validated in the prior release. Do not re-run it as part of this follow-up.

## Checks

`npm test` executes unit tests and actual SQL in isolated PostgreSQL (PGlite),
including JS/SQL parity, opposite-team rejection, UUID casing, saved-wager integrity,
settlement and one-result-per-parent accounting.

`PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium npm run test:e2e` exercises
actual UI and APIs against a local PostgreSQL-backed Supabase adapter. It verifies
compatible same-game selections/removal, invalid requests, unchanged singles,
mobile/desktop, and homepage Insights removal with the dedicated page/API intact.

Also run `npm run lint`, `npx tsc --noEmit`, `git diff --check`, and `npm run build`.

## Files changed

- `app/page.tsx`: remove only the homepage Insights preview/import.
- `lib/betting.ts`: canonical leg keys, compatibility codes/messages and explicit pricing eligibility.
- `lib/wager-api.ts`: reuse shared compatibility/pricing messages for SQL errors.
- `supabase/migrations/20261101010000_parlay_compatibility.sql`: additive helper and updated creation validation, preserving storage/settlement.
- `supabase/validate-parlay-compatibility.sql`: read-only deployment checks.
- `tests/betting.test.mts`, `tests/wagering-database.test.mts`, `tests/e2e/wagering.spec.ts`: expanded acceptance/regression coverage.
- `tests/e2e/supabase-fixture.mts`: apply the new migration to the isolated fixture.
- `tests/fixtures/parlay-compatibility-cases.ts`: shared acceptance matrix for JS/SQL/API parity.
- This document: findings, pricing limitation and exact rollout steps.
