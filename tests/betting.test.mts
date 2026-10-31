import test from "node:test";
import assert from "node:assert/strict";
import { compatibilityError, priceParlay, isSelection, wagerRecord, type Selection } from "../lib/betting.ts";
const a: Selection = { gameId:"20000000-0000-4000-8000-000000000001",sport:"nfl",pick:"Notre Dame",betType:"Spread",line:-7.5,odds:-110 };
const total: Selection = {...a,pick:"Over",betType:"Total",line:52.5};
const ml: Selection = {...a,betType:"Moneyline",line:null,odds:150};

test("same-team spread/moneyline conflicts in both insertion orders",()=>{
 for(const legs of [[a,ml],[ml,a]]) assert.match(compatibilityError(legs)!,/Notre Dame spread and Notre Dame moneyline/);
});
test("compatible same-game markets remain compatible independently of quote availability",()=>{
 for(const legs of [[a,total],[a,{...total,pick:"Under"}],[ml,total],[ml,{...total,pick:"Under"}]]) {
  assert.equal(compatibilityError(legs),null);
  assert.throws(()=>priceParlay(legs),/Same-game pricing is unavailable/);
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
