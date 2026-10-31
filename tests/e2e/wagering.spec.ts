import { test,expect } from "@playwright/test";
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
test("builder explains incompatible selections and unavailable same-game pricing",async({page})=>{
 await page.getByRole("button",{name:/Build a Parlay/}).click();
 await choose(page,"Spread","Away1");await choose(page,"Moneyline","Away1");
 await expect(page.getByRole("status")).toContainText("cannot be combined");
 await choose(page,"Total","Over");
 await expect(page.getByRole("alert").filter({hasText:"Same-game pricing"})).toContainText("Same-game pricing is unavailable");
 await expect(page.getByRole("button",{name:"Place Parlay · 1 Unit",exact:true})).toBeDisabled();
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
