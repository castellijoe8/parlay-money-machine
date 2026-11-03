import { before, beforeEach, after, test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";
import { type Selection } from "../lib/betting.ts";

const db = new PGlite();
const user = "10000000-0000-4000-8000-000000000001";
const other = "10000000-0000-4000-8000-000000000002";
const game = (n: number) => `20000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const selection = (n = 1, betType: Selection["betType"] = "Moneyline", pick?: string): Selection => ({
  gameId: game(n), sport: n === 2 ? "ncaaf" : "nfl", betType,
  pick: pick ?? (betType === "Total" ? "Over" : `Away${n}`),
  line: betType === "Spread" ? 3 : betType === "Total" ? 44.5 : null,
  odds: betType === "Moneyline" ? 150 : -110,
});
async function single(s = selection(), key = randomUUID(), who = user) {
  return (await db.query<{ id: string }>("select public.create_single_wager($1,$2,$3::jsonb) as id", [who, key, JSON.stringify(s)])).rows[0].id;
}
async function parlay(legs = [selection(1), selection(2)], key = randomUUID()) {
  return (await db.query<{ id: string }>("select public.create_parlay_wager($1,'Forged name',1,$2,999,999,999,999,$3::jsonb) as id", [user, key, JSON.stringify(legs)])).rows[0].id;
}
async function row(id: string) {
  return (await db.query<{ status: string; actual_return: string; settled_at: string }>("select status,actual_return,settled_at from public.parlay_wagers where id=$1", [id])).rows[0];
}
async function finish(n: number, away = 24, home = 21) {
  await db.query("update public.games set status='final',away_score=$2,home_score=$3 where id=$1", [game(n), away, home]);
}
async function voidGame(n: number) {
  await db.query("select public.void_game_wagers($1,'Confirmed permanent cancellation')", [game(n)]);
}
async function expectError(action: () => Promise<unknown>, pattern: RegExp) {
  await assert.rejects(action, pattern);
}
before(async () => {
  await db.exec(await readFile(new URL("./fixtures/core-schema.sql", import.meta.url), "utf8"));
  await db.exec(await readFile(new URL("../supabase/migrations/20261031000000_parlay_wagers.sql", import.meta.url), "utf8"));
  const migration = await readFile(new URL("../supabase/migrations/20261101000000_complete_wagering.sql", import.meta.url), "utf8");
  await db.exec(migration);
  await db.exec(migration); // Reapplication preserves objects and grants.
  await db.exec(await readFile(new URL("../supabase/migrations/20261101010000_parlay_compatibility.sql",import.meta.url),"utf8"));
  await db.exec(await readFile(new URL("../supabase/migrations/20261101020000_social_parlay_payout.sql",import.meta.url),"utf8"));
});
beforeEach(async () => {
  await db.exec("truncate public.game_voids,public.parlay_legs,public.parlay_wagers,public.picks,public.games cascade");
  for (let n = 1; n <= 5; n++) {
    await db.query(`insert into public.games(id,sport,starts_at,status,away_team,home_team,spread,spread_home,total,
      spread_odds_away,spread_odds_home,total_odds_over,total_odds_under,moneyline_away,moneyline_home)
      values($1,$2,now()+interval '1 day','scheduled',$3,$4,3,-3,44.5,-110,-110,-110,-110,150,-160)`,
    [game(n), n === 2 ? "ncaaf" : "nfl", `Away${n}`, `Home${n}`]);
  }
});
after(async () => { await db.close(); });

test("over, spread and moneyline on one game persist as separate singles", async () => {
  await single(selection(1, "Total")); await single(selection(1, "Spread")); await single();
  const { rows } = await db.query<{ count: number }>("select count(*)::int as count from public.picks");
  assert.equal(rows[0].count, 3);
});
test("single replay is idempotent even after kickoff, and new intent may repeat a selection", async () => {
  const key = randomUUID(), id = await single(selection(), key);
  await single(selection());
  await finish(1);
  assert.equal(await single(selection(), key), id);
  await expectError(() => single(selection(1, "Total"), key), /idempotency_conflict/);
  assert.equal((await db.query<{ n: number }>("select count(*)::int n from public.picks")).rows[0].n, 2);
});
test("single first/parlay second and parlay first/single second never lock selections", async () => {
  await single(); await parlay(); await single(selection(2));
  await single(selection(1, "Total")); await single(selection(1, "Spread"));
  assert.equal((await db.query<{ n: number }>("select count(*)::int n from public.picks")).rows[0].n, 4);
});
test("server ignores forged combined odds, payout and profile labels", async () => {
  const id = await parlay();
  const { rows } = await db.query<{ stake: string; combined_decimal_odds: string; potential_return: string; user_name: string; pricing_method: string }>("select * from public.parlay_wagers where id=$1", [id]);
  assert.equal(Number(rows[0].stake), 1); assert.equal(Number(rows[0].combined_decimal_odds), 6.25);
  assert.equal(Number(rows[0].potential_return), 6.25); assert.equal(rows[0].user_name, "PlayerOne");
  assert.equal(rows[0].pricing_method, "independent_games");
});
test("parlay retry returns same parent after kickoff and rejects changed payload", async () => {
  const key = randomUUID(), legs = [selection(), selection(2)];
  const id = await parlay(legs, key);
  await finish(1);
  assert.equal(await parlay([...legs].reverse(), key), id);
  await expectError(() => parlay([selection(3), selection(2)], key), /idempotency_conflict/);
});
test("stale odds, wrong sport, wrong line, nonexistent and closed games are rejected atomically", async () => {
  await expectError(() => parlay([{ ...selection(), odds: 999 }, selection(2)]), /price_changed/);
  await expectError(() => parlay([{ ...selection(), sport: "ncaaf" }, selection(2)]), /invalid_sport/);
  await expectError(() => single({ ...selection(1, "Spread"), line: 99 }), /price_changed/);
  await expectError(() => single({ ...selection(), gameId: randomUUID() }), /invalid_selection/);
  await finish(1);
  await expectError(() => parlay(), /wagering_closed/);
  assert.equal((await db.query<{ n: number }>("select count(*)::int n from public.parlay_wagers")).rows[0].n, 0);
});
test("SQL rejects duplicate and conflicting legs regardless of ordering", async () => {
  for (const legs of [[selection(), selection()], [selection(1,"Spread"),selection()], [selection(),selection(1,"Spread")],
    [selection(),{...selection(),pick:"Home1",odds:-160}], [selection(1,"Total"),selection(1,"Total","Under")],
    [selection(1,"Spread"),{...selection(1,"Spread"),pick:"Home1",line:-3}]]) {
    await expectError(() => parlay(legs), /duplicate_selection|conflicting_side_markets|conflicting_totals|repeated_spread|repeated_moneyline/);
  }
});
test("compatible same-game and mixed groups persist under house payout rules", async () => {
  for (const legs of [[selection(1,"Spread"),selection(1,"Total")], [selection(),selection(1,"Total","Under")],
    [selection(),selection(1,"Total")], [selection(1,"Spread"),selection(1,"Total","Under"),selection(2)]]) {
    const id=await parlay(legs);
    assert.equal((await db.query<{pricing_method:string}>("select pricing_method from public.parlay_wagers where id=$1",[id])).rows[0].pricing_method,"house_decimal_product_v1");
  }
});
test("all winners settle once and unresolved games never prematurely win", async () => {
  const id = await parlay(); await finish(1); assert.equal((await row(id)).status, "pending");
  await finish(2); const settled = await row(id);
  assert.equal(settled.status, "won"); assert.equal(Number(settled.actual_return), 6.25);
  await db.query("select public.settle_parlay_legs($1)", [game(2)]);
  assert.deepEqual(await row(id), settled);
});
test("a loss settles immediately while later legs remain unresolved", async () => {
  const id = await parlay(); await finish(1, 10, 30);
  assert.equal((await row(id)).status, "lost"); assert.equal(Number((await row(id)).actual_return), 0);
});
test("push and void legs are removed from the effective price", async () => {
  const pushed = await parlay([selection(1,"Spread"),selection(2)]);
  const voided = await parlay([selection(3),selection(2)]);
  await finish(1,21,24); await voidGame(3); await finish(2);
  for (const id of [pushed,voided]) { assert.equal((await row(id)).status,"won"); assert.equal(Number((await row(id)).actual_return),2.5); }
});
test("all push and all void refund stake and each count as one tie", async () => {
  const pushed = await parlay([selection(1,"Spread"),selection(2,"Spread")]);
  const voided = await parlay([selection(3),selection(4)]);
  await finish(1,21,24); await finish(2,21,24); await voidGame(3); await voidGame(4);
  assert.equal((await row(pushed)).status,"push"); assert.equal((await row(voided)).status,"void");
  for (const id of [pushed,voided]) assert.equal(Number((await row(id)).actual_return),1);
  const { rows } = await db.query<{ n:number }>("select count(*)::int n from public.wager_records where result='push'"); assert.equal(rows[0].n,2);
});
test("ordinary postponement stays pending; permanent cancellation is audited and retry safe", async () => {
  const id = await parlay(); await single();
  await db.query("update public.games set status='postponed' where id=$1",[game(1)]);
  assert.equal((await row(id)).status,"pending");
  await voidGame(1); await voidGame(1); await finish(2);
  assert.equal((await row(id)).status,"won");
  assert.equal((await db.query<{n:number}>("select count(*)::int n from public.game_voids")).rows[0].n,1);
  assert.equal((await db.query<{result:string}>("select result from public.picks")).rows[0].result,"push");
  await expectError(() => single(), /wagering_closed/);
});
test("parent-only record is exactly 2 wins, 2 losses, 1 tie with overlapping wagers", async () => {
  const won=await parlay([selection(1),selection(2),selection(3)]);
  const lost=await parlay([selection(1),selection(2),selection(3),selection(4)]);
  const tied=await parlay([selection(1,"Spread"),selection(2,"Spread")]);
  // Fixture outcomes isolate record counting from grading (grading tested above).
  await db.query("update public.parlay_wagers set status='won',actual_return=15.63 where id=$1",[won]);
  await db.query("update public.parlay_wagers set status='lost',actual_return=0 where id=$1",[lost]);
  await db.query("update public.parlay_wagers set status='push',actual_return=1 where id=$1",[tied]);
  const a=await single(),b=await single(selection(1,"Total"));
  await db.query("update public.picks set result='win',units=1.5 where id=$1",[a]);
  await db.query("update public.picks set result='loss',units=-1 where id=$1",[b]);
  const result=await db.query<{result:string;n:number}>("select result,count(*)::int n from public.wager_records group by result order by result");
  assert.deepEqual(result.rows,[{result:'loss',n:2},{result:'push',n:1},{result:'win',n:2}]);
  await db.exec("set role authenticated");
  try {
    assert.equal((await db.query<{n:number}>("select count(*)::int n from public.wager_records")).rows[0].n,5);
  } finally { await db.exec("reset role"); }
});
test("RLS prevents result edits, identity spoofing and direct RPC calls", async () => {
  await single(selection(), randomUUID(), other);
  await db.exec("set role authenticated");
  try {
    await expectError(() => single(), /permission denied/);
    await expectError(() => parlay(), /permission denied/);
    await expectError(() => db.query("update public.picks set result='win'"), /permission denied/);
    await db.query("select set_config('request.jwt.claim.sub',$1,false)",[user]);
    await expectError(() => db.query("insert into public.picks(user_id,game_id,pick,bet_type,odds,result,units) values($1,$2,'Away1','Moneyline',150,'pending',1)",[other,game(1)]), /row-level security/);
  } finally { await db.exec("reset role"); }
  await db.exec("set role anon");
  try { await expectError(() => db.query("select public.score_game($1)",[game(1)]), /permission denied/); }
  finally { await db.exec("reset role"); }
});
test("reapplying migration preserves existing singles, parent prices and legs", async () => {
  const id = await parlay(); await single();
  const before = await db.query("select * from public.wager_records order by kind,id");
  const accepted = await db.query("select accepted_group_prices from public.parlay_wagers where id=$1",[id]);
  await db.exec(await readFile(new URL("../supabase/migrations/20261101000000_complete_wagering.sql",import.meta.url),"utf8"));
  await db.exec(await readFile(new URL("../supabase/migrations/20261101010000_parlay_compatibility.sql",import.meta.url),"utf8"));
  await db.exec(await readFile(new URL("../supabase/migrations/20261101020000_social_parlay_payout.sql",import.meta.url),"utf8"));
  assert.deepEqual((await db.query("select * from public.wager_records order by kind,id")).rows,before.rows);
  assert.deepEqual((await db.query("select accepted_group_prices from public.parlay_wagers where id=$1",[id])).rows,accepted.rows);
  const validation = await db.query<Record<string,boolean>>(await readFile(new URL("../supabase/validate-wagering.sql",import.meta.url),"utf8"));
  assert.ok(Object.values(validation.rows[0]).every(value=>value===true));
  const compatibilityValidation=await db.query<Record<string,boolean>>(await readFile(new URL("../supabase/validate-parlay-compatibility.sql",import.meta.url),"utf8"));
  assert.ok(Object.values(compatibilityValidation.rows[0]).every(value=>value===true));
  const houseValidation=await db.query<Record<string,boolean>>(await readFile(new URL("../supabase/validate-social-parlay-payout.sql",import.meta.url),"utf8"));
  assert.ok(Object.values(houseValidation.rows[0]).every(value=>value===true));
});
test("canceled provider status automatically voids pending legs", async () => {
  const id = await parlay();
  await db.query("update public.games set status='canceled' where id=$1",[game(1)]);
  assert.equal((await row(id)).status,"pending");
  await finish(2);
  assert.equal((await row(id)).status,"won");
  assert.equal(Number((await row(id)).actual_return),2.5);
});

import { compatiblePairs, incompatibleGroups } from "./fixtures/parlay-compatibility-cases.ts";
import { compatibilityIssue } from "../lib/betting.ts";
test("SQL and shared frontend/API rules agree on every pair, sport and insertion order",async()=>{
 for(const sport of ["nfl","ncaaf"] as const) for(const legs of [...compatiblePairs,...incompatibleGroups.map((group)=>group.legs)]) {
  for(const order of [legs,[...legs].reverse()]) {
   const selections=order.map((leg)=>({...leg,sport}));
   const sql=(await db.query<{issue:string|null}>("select public.parlay_compatibility_error($1::jsonb) issue",[JSON.stringify(selections)])).rows[0].issue;
   assert.equal(sql,compatibilityIssue(selections));
  }
 }
});
test("opposing-team spread and moneyline cannot bypass direct RPC validation",async()=>{
 for(const legs of [[selection(1,"Spread"),{...selection(),pick:"Home1",odds:-160}],
  [{...selection(1,"Spread"),pick:"Home1",line:-3},selection()]]) {
   for(const order of [legs,[...legs].reverse()]) await expectError(()=>parlay(order),/conflicting_side_markets/);
 }
});
test("case variants of one UUID must be labeled as a house payout, not independent games",async()=>{
 const uuid="abcdefab-0000-4000-8000-000000000001";
 await db.query("update public.games set id=$1 where id=$2",[uuid,game(1)]);
 const side={...selection(1,"Spread"),gameId:uuid};
 const total={...selection(1,"Total"),gameId:uuid.toUpperCase()};
 const id=await parlay([side,total]);
 const saved=(await db.query<{pricing_method:string;potential_return:string}>("select pricing_method,potential_return from public.parlay_wagers where id=$1",[id])).rows[0];
 assert.equal(saved.pricing_method,"house_decimal_product_v1");assert.equal(Number(saved.potential_return),3.64);
});
test("Miami ML -150 plus Over -110 freezes 3.18 return, settles once and counts once",async()=>{
 await db.query("update public.games set away_team='Miami',moneyline_away=-150 where id=$1",[game(1)]);
 const legs=[{...selection(),pick:"Miami",odds:-150},selection(1,"Total")];
 const key=randomUUID(),id=await parlay(legs,key);
 const saved=(await db.query<{pricing_method:string;potential_return:string;potential_profit:string;stake:string}>("select * from public.parlay_wagers where id=$1",[id])).rows[0];
 assert.equal(saved.pricing_method,"house_decimal_product_v1");assert.equal(Number(saved.stake),1);
 assert.equal(Number(saved.potential_return),3.18);assert.equal(Number(saved.potential_profit),2.18);
 // Settlement must use frozen wager prices, not subsequently updated game odds.
 await db.query("update public.games set moneyline_away=-300,total_odds_over=-200 where id=$1",[game(1)]);
 await finish(1,24,21);
 assert.equal((await row(id)).status,"won");assert.equal(Number((await row(id)).actual_return),3.18);
 assert.equal(await parlay(legs,key),id);
 const settled=await row(id);await db.query("select public.settle_parlay_legs($1)",[game(1)]);assert.deepEqual(await row(id),settled);
 const records=(await db.query<{result:string;units:string}>("select result,units from public.wager_records where id=$1",[id])).rows;
 assert.equal(records.length,1);assert.equal(records[0].result,"win");assert.equal(Number(records[0].units),2.18);
});
test("house same-game payouts accept either side and total for both sports",async()=>{
 for(const n of [1,2])for(const market of ["Spread","Moneyline"] as const)for(const home of [false,true])for(const totalPick of ["Over","Under"]){
  const side=selection(n,market,home?`Home${n}`:`Away${n}`);
  if(home){side.line=market==="Spread"?-3:null;side.odds=market==="Spread"?-110:-160;}
  const id=await parlay([side,selection(n,"Total",totalPick)]);
  const saved=(await db.query<{pricing_method:string;potential_return:string}>("select pricing_method,potential_return from public.parlay_wagers where id=$1",[id])).rows[0];
  assert.equal(saved.pricing_method,"house_decimal_product_v1");
  assert.equal(Number(saved.potential_return),market==="Spread"?3.64:home?3.10:4.77);
 }
});
test("house push removes only that leg; both legs pushing refund one stake",async()=>{
 await db.query("update public.games set total=44 where id=$1",[game(1)]);
 const partial=await parlay([selection(1,"Spread"),{...selection(1,"Total"),line:44}]);
 await finish(1,24,20);
 assert.equal((await row(partial)).status,"won");assert.equal(Number((await row(partial)).actual_return),1.91);
 await db.query("update public.games set total=45 where id=$1",[game(2)]);
 const refund=await parlay([selection(2,"Spread"),{...selection(2,"Total"),line:45}]);
 await finish(2,21,24);assert.equal((await row(refund)).status,"push");assert.equal(Number((await row(refund)).actual_return),1);
});
test("voiding a same-game group removes both legs from a mixed house payout",async()=>{
 const id=await parlay([selection(1,"Spread"),selection(1,"Total"),selection(2)]);
 await voidGame(1);assert.equal((await row(id)).status,"pending");
 await finish(2);assert.equal((await row(id)).status,"won");assert.equal(Number((await row(id)).actual_return),2.5);
 const allVoid=await parlay([selection(3),selection(3,"Total")]);await voidGame(3);
 assert.equal((await row(allVoid)).status,"void");assert.equal(Number((await row(allVoid)).actual_return),1);
});
