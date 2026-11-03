import test from "node:test";
import assert from "node:assert/strict";
import { compatibilityError, priceParlay, isSelection, wagerRecord, type Selection } from "../lib/betting.ts";
const a: Selection = { gameId:"20000000-0000-4000-8000-000000000001",sport:"nfl",pick:"Notre Dame",betType:"Spread",line:-7.5,odds:-110 };
const total: Selection = {...a,pick:"Over",betType:"Total",line:52.5};
const ml: Selection = {...a,betType:"Moneyline",line:null,odds:150};

test("same-team spread/moneyline conflicts in both insertion orders",()=>{
 for(const legs of [[a,ml],[ml,a]]) assert.match(compatibilityError(legs)!,/spread and moneyline from the same game/);
});
test("compatible same-game markets receive explicitly versioned house payouts",()=>{
 for(const legs of [[a,total],[a,{...total,pick:"Under"}],[ml,total],[ml,{...total,pick:"Under"}]]) {
  assert.equal(compatibilityError(legs),null);
  assert.equal(priceParlay(legs).pricingMethod,"house_decimal_product_v1");
 }
});
test("duplicates and contradictory markets are rejected",()=>{
 for(const legs of [[a,a],[ml,{...ml,pick:"Opponent"}],[a,{...a,pick:"Opponent",line:7.5}],[total,{...total,pick:"Under"}]]) assert.ok(compatibilityError(legs));
});
test("NFL/NCAAF independent games are priced without premature rounding",()=>{
 const quote=priceParlay([ml,{...ml,gameId:"20000000-0000-4000-8000-000000000002",sport:"ncaaf"}]);
 assert.equal(quote.decimalOdds,6.25);assert.equal(quote.profit,5.25);assert.equal(quote.totalReturn,6.25);assert.equal(quote.pricingMethod,"independent_games");
});
test("malformed selections cannot enter the server validator",()=>{
 assert.ok(isSelection(a));
 for(const s of [null,{}, {...a,odds:null},{...a,odds:1.5},{...a,sport:"nba"},{...a,gameId:"bad"},{...ml,line:3},{...total,line:null}]) assert.equal(isSelection(s),false);
});
test("each parent maps to one record and net units exclude refunded stake",()=>{
 assert.deepEqual(wagerRecord("won",1,6.25),{result:"win",units:5.25});
 assert.deepEqual(wagerRecord("lost",1,0),{result:"loss",units:-1});
 assert.deepEqual(wagerRecord("void",1,1),{result:"push",units:0});
 assert.deepEqual(wagerRecord("pending",1,null),{result:"pending",units:0});
});

// Every rule applies independently of team labels, sport, UUID casing or order.
import { compatiblePairs, incompatibleGroups } from "./fixtures/parlay-compatibility-cases.ts";
import { compatibilityIssue, selectionKey } from "../lib/betting.ts";
test("all side/total pairs are compatible in both orders for NFL and NCAAF", () => {
 for (const sport of ["nfl", "ncaaf"] as const) for (const legs of compatiblePairs) {
  for (const order of [legs, [...legs].reverse()]) assert.equal(compatibilityError(order.map((leg) => ({ ...leg, sport }))), null);
 }
});
test("one-side-one-total restrictions match every prohibited combination", () => {
 for (const {legs,code} of incompatibleGroups) {
  for (const order of [legs,[...legs].reverse()]) assert.equal(compatibilityIssue(order),code);
 }
});
test("UUID case variants cannot evade compatibility or same-game pricing", () => {
 const [side,total] = compatiblePairs[0];
 assert.equal(selectionKey(side),selectionKey({...side,gameId:side.gameId.toUpperCase()}));
 assert.equal(compatibilityIssue([side,{...side,gameId:side.gameId.toUpperCase()}]),"duplicate_selection");
 assert.equal(priceParlay([side,{...total,gameId:total.gameId.toUpperCase()}]).pricingMethod,"house_decimal_product_v1");
});
test("mixed parlays use house rules while three independent games keep their existing method", () => {
 const [side,total] = compatiblePairs[0];
 const second={...side,gameId:"bbbbbbbb-0000-4000-8000-000000000002",sport:"nfl" as const};
 const third={...side,gameId:"cccccccc-0000-4000-8000-000000000003"};
 assert.equal(compatibilityIssue([side,total,second]),null);
 assert.equal(priceParlay([side,total,second]).pricingMethod,"house_decimal_product_v1");
 assert.ok(priceParlay([side,second,third]).decimalOdds>1);
});

test("Miami ML -150 plus Over -110 returns 3.18 units for a one-unit house parlay",()=>{
 const quote=priceParlay([{...ml,pick:"Miami",odds:-150},{...total,odds:-110}]);
 assert.equal(quote.pricingMethod,"house_decimal_product_v1");
 assert.equal(quote.totalReturn,3.18);assert.equal(quote.profit,2.18);assert.equal(quote.americanOdds,218);
});
