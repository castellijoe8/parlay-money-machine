import { test,expect } from "@playwright/test";
import { incompatibleGroups } from "../fixtures/parlay-compatibility-cases";
import { COMPATIBILITY_MESSAGES, type Selection } from "../../lib/betting";
const uid="10000000-0000-4000-8000-000000000001";
const payload=Buffer.from(JSON.stringify({sub:uid,exp:Math.floor(Date.now()/1000)+86400,role:"authenticated"})).toString("base64url");
const token=`eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.${payload}.fixture`;
test.beforeEach(async({page,request})=>{
 await request.get("http://127.0.0.1:54329/__reset");
 await page.addInitScript(({uid,token})=>{
  localStorage.setItem("sb-127-auth-token",JSON.stringify({access_token:token,refresh_token:"fixture",token_type:"bearer",expires_in:86400,expires_at:Math.floor(Date.now()/1000)+86400,user:{id:uid,email:"fixture@example.test",aud:"authenticated",role:"authenticated",app_metadata:{},user_metadata:{}}}));
 },{uid,token});
 await page.goto("/");
 await page.getByRole("button",{name:"NFL",exact:true}).click();
 await expect(page.locator('#game-20000000-0000-4000-8000-000000000001')).toBeVisible();
});
const card=(page:import("@playwright/test").Page,n=1)=>page.locator(`#game-20000000-0000-4000-8000-${String(n).padStart(12,"0")}`);
async function choose(page:import("@playwright/test").Page,market:string,pick:string,n=1){
 const group=card(page,n).locator("div.rounded-xl.bg-gray-50").filter({has:page.locator("p",{hasText:new RegExp(`^${market}$`)})});
 const minimize = page.getByRole("button",{name:"Minimize slip",exact:true});
 if (await minimize.isVisible()) await minimize.click();
 const button = group.getByRole("button").filter({hasText:pick});
 await button.evaluate((el) => el.scrollIntoView({block:"center"}));
 await button.click();
 const expand = page.getByRole("button",{name:/Expand slip/});
 if (await expand.isVisible()) await expand.click();
}
test("homepage keeps all markets available after placing over, spread and moneyline",async({page,request})=>{
 for(const [market,pick]of [["Total","Over"],["Spread","Away1"],["Moneyline","Away1"]]){
  await choose(page,market,pick);
  await page.getByRole("button",{name:"Confirm Wager",exact:true}).click();
  await expect(card(page).getByText(/Your wagers/)).toContainText(String([["Total","Over"],["Spread","Away1"],["Moneyline","Away1"]].findIndex(x=>x[0]===market)+1));
 }
 await expect(card(page).getByRole("button").filter({hasText:"Under"})).toBeEnabled();
 expect(await(await request.get("http://127.0.0.1:54329/__counts")).json()).toEqual([{kind:"single",n:3}]);
 await page.goto("/wagers");await expect(page.getByText("Over",{exact:true})).toBeVisible();
});
test("overlapping singles and mixed-game parlay remain independent",async({page,request})=>{
 await choose(page,"Moneyline","Away1");await page.getByRole("button",{name:"Confirm Wager",exact:true}).click();
 await expect(card(page).getByText(/Your wagers/)).toBeVisible();
 await page.getByRole("button",{name:/Build a Parlay/}).click();
 await choose(page,"Moneyline","Away1");await choose(page,"Moneyline","Away2",2);
 await expect(page.getByRole("button",{name:"Place Parlay · 1 Unit",exact:true})).toBeEnabled();
 await page.getByRole("button",{name:"Place Parlay · 1 Unit",exact:true}).click();
 await expect(page.getByRole("status")).toContainText("Parlay placed");
 await choose(page,"Moneyline","Away2",2);await page.getByRole("button",{name:"Confirm Wager",exact:true}).click();
 await expect(card(page,2).getByText(/Your wagers/)).toBeVisible();
 expect(await(await request.get("http://127.0.0.1:54329/__counts")).json()).toEqual([{kind:"parlay",n:1},{kind:"single",n:2}]);
});
test("builder rejects conflicts and enables compatible same-game house payouts",async({page})=>{
 await page.getByRole("button",{name:/Build a Parlay/}).click();
 await choose(page,"Spread","Away1");await choose(page,"Moneyline","Away1");
 await expect(page.getByRole("status")).toContainText("can't combine a spread and moneyline");
 await choose(page,"Total","Over");
 await expect(page.getByText(/House payout rule:/)).toBeVisible();
 await expect(page.getByRole("button",{name:"Place Parlay · 1 Unit",exact:true})).toBeEnabled();
 await page.getByRole("button",{name:"Remove Over Total"}).click();
 await choose(page,"Moneyline","Away2",2);
 await expect(page.getByRole("button",{name:"Place Parlay · 1 Unit",exact:true})).toBeEnabled();
});
test("mobile slip permits removing, clearing, and switching back to singles",async({page})=>{
 await page.setViewportSize({width:390,height:844});
 await page.getByRole("button",{name:/Build a Parlay/}).click();
 await choose(page,"Moneyline","Away1");await choose(page,"Moneyline","Away2",2);
 await expect(page.getByRole("button",{name:"Place Parlay · 1 Unit",exact:true})).toBeVisible();
 await page.getByRole("button",{name:"Clear all",exact:true}).click();
 await expect(page.getByText("Choose at least two selections from the game cards.",{exact:false})).toBeVisible();
 await page.getByRole("button",{name:"Single wager mode",exact:true}).click();
 await choose(page,"Total","Under");await expect(page.getByRole("button",{name:"Confirm Wager",exact:true})).toBeVisible();
});
test("double click produces one single-wager submission",async({page,request})=>{
 await choose(page,"Total","Over");
 await page.getByRole("button",{name:"Confirm Wager",exact:true}).evaluate((button:HTMLButtonElement)=>{button.click();button.click();});
 await expect(card(page).getByText(/Your wagers/)).toContainText("1");
 expect(await(await request.get("http://127.0.0.1:54329/__counts")).json()).toEqual([{kind:"single",n:1}]);
});
test("compatible same-game legs coexist and can be removed independently on desktop and mobile",async({page})=>{
 for(const width of [1280,390]) {
  await page.setViewportSize({width,height:844});
  await page.getByRole("button",{name:/Build a Parlay/}).click();
  for(const side of ["Spread","Moneyline"]) for(const total of ["Over","Under"]) {
   await choose(page,side,"Away1"); await choose(page,"Total",total);
   await expect(page.getByText("Parlay Builder · 2 selections",{exact:true})).toBeVisible();
   await expect(page.getByRole("button",{name:`Remove Away1 ${side}`,exact:true})).toBeVisible();
   await expect(page.getByText(/House payout rule:/)).toBeVisible();
   await page.getByRole("button",{name:`Remove ${total} Total`,exact:true}).click();
   await expect(page.getByRole("button",{name:`Remove Away1 ${side}`,exact:true})).toBeVisible();
   await expect(page.getByText("Parlay Builder · 1 selections",{exact:true})).toBeVisible();
   await page.getByRole("button",{name:"Clear all",exact:true}).click();
  }
  await choose(page,"Spread","Away1"); await choose(page,"Moneyline","Home1");
  await expect(page.getByRole("status")).toContainText("can't combine a spread and moneyline");
  await expect(page.getByText("Parlay Builder · 1 selections",{exact:true})).toBeVisible();
  await page.getByRole("button",{name:"Clear all",exact:true}).click();
  await page.getByRole("button",{name:"Single wager mode",exact:true}).click();
 }
});
test("invalid direct API requests cannot create conflicting parlay legs",async({request})=>{
 for(const {legs,code} of incompatibleGroups) for(const order of [legs,[...legs].reverse()]) {
  const response=await request.post("/api/parlays",{headers:{Authorization:`Bearer ${token}`},data:{idempotencyKey:crypto.randomUUID(),selections:order}});
  expect(response.status()).toBe(400);
  expect((await response.json()).error).toBe(COMPATIBILITY_MESSAGES[code as keyof typeof COMPATIBILITY_MESSAGES]);
 }
 // Invalid requests leave no wager behind. Compatible house payouts are accepted.
 expect(await(await request.get("http://127.0.0.1:54329/__counts")).json()).toEqual([]);
 const side:Selection={gameId:"20000000-0000-4000-8000-000000000001",sport:"nfl",pick:"Away1",betType:"Spread",line:3,odds:-110};
 const response=await request.post("/api/parlays",{headers:{Authorization:`Bearer ${token}`},data:{idempotencyKey:crypto.randomUUID(),selections:[side,{...side,pick:"Over",betType:"Total",line:44.5}]}});
 expect(response.status()).toBe(201);
 expect(await(await request.get("http://127.0.0.1:54329/__counts")).json()).toEqual([{kind:"parlay",n:1}]);
});
test("Insights is absent from homepage but its dedicated navigation and API remain",async({page})=>{
 const insightRequests:string[]=[];
 page.on("request",request=>{if(new URL(request.url()).pathname==="/api/daily-edge")insightRequests.push(request.url());});
 await page.goto("/");
 await expect(page.getByRole("heading",{name:"Games",exact:true})).toBeVisible();
 await expect(page.getByRole("heading",{name:"The Daily Edge",exact:true})).toHaveCount(0);
 expect(insightRequests).toEqual([]);
 const response=page.waitForResponse(response=>new URL(response.url()).pathname==="/api/daily-edge");
 await page.getByRole("navigation",{name:"Main navigation",exact:true}).getByRole("link",{name:"Daily Edge",exact:true}).click();
 await expect(page.getByRole("heading",{name:"The Daily Edge",exact:true})).toBeVisible();
 expect((await response).status()).toBe(200);
});
for(const width of [1280,390]) test(`same-game house parlay can be placed and reviewed at ${width}px`,async({page,request})=>{
 await page.setViewportSize({width,height:844});
 await choose(page,"Moneyline","Away1");await page.getByRole("button",{name:"Confirm Wager",exact:true}).click();
 await expect(card(page).getByText(/Your wagers/)).toBeVisible();
 await page.getByRole("button",{name:/Build a Parlay/}).click();
 await choose(page,"Moneyline","Away1");await choose(page,"Total","Over");
 await expect(page.getByText(/House payout rule:/)).toContainText("not adjusted for correlation");
 await page.getByRole("button",{name:"Place Parlay · 1 Unit",exact:true}).click();
 await expect(page.getByRole("status")).toContainText("Parlay placed");
 expect(await(await request.get("http://127.0.0.1:54329/__counts")).json()).toEqual([{kind:"parlay",n:1},{kind:"single",n:1}]);
 await page.goto("/wagers");
 await expect(page.getByText("Pricing: House payout · decimal product v1",{exact:true})).toBeVisible();
 await expect(page.getByText("Legacy SGP estimate",{exact:true})).toHaveCount(0);
 await page.getByText("Pricing: House payout · decimal product v1",{exact:true}).click();
 await expect(page.getByText(/House payout rule:/)).toBeVisible();
});
test("leaderboard records stay on one line on mobile and Parlays combines with sport filters",async({page,request})=>{
 const seeded=await request.post("http://127.0.0.1:54329/__seed-leaderboard");expect(seeded.ok()).toBeTruthy();
 await page.goto("/leaderboard");
 const player=page.getByTestId("leaderboard-player-row").filter({hasText:"LongMobilePlayerName"});
 const record=player.getByTestId("leaderboard-record");
 await expect(record).toHaveText("124–46–7");
 await expect(page.getByTestId("leaderboard-player-row")).toHaveCount(2);
 for(const width of [320,360,390,768,1280]){
  await page.setViewportSize({width,height:844});
  const dimensions=await record.evaluate(el=>({height:el.getBoundingClientRect().height,lineHeight:parseFloat(getComputedStyle(el).lineHeight),nowrap:getComputedStyle(el).whiteSpace}));
  expect(dimensions.nowrap).toBe("nowrap");expect(dimensions.height).toBeLessThanOrEqual(Math.ceil(dimensions.lineHeight)+1);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth)).toBeTruthy();
  if(width===320)await page.screenshot({path:"/tmp/leaderboard-mobile-320.png",fullPage:true});
 }
 await page.setViewportSize({width:390,height:844});
 const type=page.getByRole("group",{name:"Wager type",exact:true}),sport=page.getByRole("group",{name:"Sport",exact:true});
 await type.getByRole("button",{name:"Parlays",exact:true}).click();await expect(record).toHaveText("1–1–1");await expect(page.getByTestId("leaderboard-player-row")).toHaveCount(1);
 await expect(type.getByRole("button",{name:"Parlays",exact:true})).toHaveAttribute("aria-pressed","true");
 await sport.getByRole("button",{name:"NFL",exact:true}).click();await expect(record).toHaveText("1–0–1");
 await sport.getByRole("button",{name:"NCAAF",exact:true}).click();await expect(record).toHaveText("0–1–1");
 await sport.getByRole("button",{name:"All",exact:true}).click();
 await type.getByRole("button",{name:"Singles",exact:true}).click();await expect(record).toHaveText("123–45–6");
 await type.getByRole("button",{name:"All bets",exact:true}).click();await expect(record).toHaveText("124–46–7");
});
