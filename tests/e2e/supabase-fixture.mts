// Local Supabase HTTP adapter over real isolated PostgreSQL. Never uses live keys.
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
const db = new PGlite();
await db.exec(await readFile(new URL("../fixtures/core-schema.sql",import.meta.url),"utf8"));
for(const migration of ["20261031000000_parlay_wagers.sql","20261101000000_complete_wagering.sql","20261101010000_parlay_compatibility.sql","20261101020000_social_parlay_payout.sql"])
  await db.exec(await readFile(new URL(`../../supabase/migrations/${migration}`,import.meta.url),"utf8"));
const uid="10000000-0000-4000-8000-000000000001";
async function reset(){
 await db.query("update public.profiles set display_name=case when id=$1 then 'PlayerOne' else 'PlayerTwo' end",[uid]);
 await db.exec("truncate public.game_voids,public.parlay_legs,public.parlay_wagers,public.picks,public.games cascade");
 for(let n=1;n<=3;n++)await db.query(`insert into public.games(id,sport,starts_at,status,away_team,home_team,spread,spread_home,total,spread_odds_away,spread_odds_home,total_odds_over,total_odds_under,moneyline_away,moneyline_home)
 values($1,'nfl',now()+interval '2 days','scheduled',$2,$3,3,-3,44.5,-110,-110,-110,-110,150,-160)`,[`20000000-0000-4000-8000-${String(n).padStart(12,"0")}`,`Away${n}`,`Home${n}`]);
}
await reset();
async function seedLeaderboard(){
 await db.query("update public.profiles set display_name='LongMobilePlayerName' where id=$1",[uid]);
 await db.query("update public.games set sport='ncaaf' where id='20000000-0000-4000-8000-000000000002'");
 await db.query(`insert into public.picks(user_id,game_id,pick,bet_type,line,odds,result,units,created_at)
  select $1,'20000000-0000-4000-8000-000000000001','Away1','Moneyline',null,150,'pending',1,now()-n*interval '1 second' from generate_series(1,174) n`,[uid]);
 await db.query(`with ranked as(select id,row_number() over(order by created_at,id) n from public.picks where user_id=$1)
  update public.picks p set result=case when r.n<=123 then 'win' when r.n<=168 then 'loss' else 'push' end,
  units=case when r.n<=123 then 1.5 when r.n<=168 then -1 else 0 end from ranked r where p.id=r.id`,[uid]);
 const otherSingle=await db.query<{id:string}>("select public.create_single_wager($1,gen_random_uuid(),$2::jsonb) id",["10000000-0000-4000-8000-000000000002",JSON.stringify({gameId:"20000000-0000-4000-8000-000000000001",sport:"nfl",pick:"Away1",betType:"Moneyline",line:null,odds:150})]);
 await db.query("update public.picks set result='loss',units=-1 where id=$1",[otherSingle.rows[0].id]);
 const selectLeg=(n:number,total=false)=>({gameId:`20000000-0000-4000-8000-${String(n).padStart(12,"0")}`,sport:n===2?'ncaaf':'nfl',pick:total?'Over':`Away${n}`,betType:total?'Total':'Moneyline',line:total?44.5:null,odds:total?-110:150});
 for(const [legs,status,actualReturn]of [
  [[selectLeg(1),selectLeg(1,true)],'won',4.77],
  [[selectLeg(2),selectLeg(2,true)],'lost',0],
  [[selectLeg(1),selectLeg(2)],'push',1],
 ]as const){
  const result=await db.query<{id:string}>("select public.create_parlay_wager($1,'Player',1,gen_random_uuid(),0,0,0,0,$2::jsonb) id",[uid,JSON.stringify(legs)]);
  await db.query("update public.parlay_wagers set status=$2,actual_return=$3,settled_at=now() where id=$1",[result.rows[0].id,status,actualReturn]);
 }
}
const server=createServer(async(req,res)=>{
 res.setHeader("Access-Control-Allow-Origin","http://127.0.0.1:3200");
 res.setHeader("Access-Control-Allow-Headers",req.headers["access-control-request-headers"]??"authorization,apikey,content-type,x-client-info,prefer,accept-profile,range,x-supabase-api-version");
 res.setHeader("Access-Control-Allow-Methods","GET,POST,PATCH,DELETE,OPTIONS");
 if(req.method==="OPTIONS"){res.writeHead(204);res.end();return;}
 const url=new URL(req.url!,"http://127.0.0.1:54329");
 const send=(data:unknown,status=200)=>{res.writeHead(status,{"Content-Type":"application/json"});res.end(JSON.stringify(data));};
 try{
  if(url.pathname==="/__reset"){await reset();send({ok:true});return;}
  if(url.pathname==="/__seed-leaderboard"){await seedLeaderboard();send({ok:true});return;}
  if(url.pathname==="/__counts"){send((await db.query("select kind,count(*)::int n from public.wager_records group by kind order by kind")).rows);return;}
  if(url.pathname==="/auth/v1/user"){send({id:uid,aud:"authenticated",role:"authenticated",email:"fixture@example.test",app_metadata:{provider:"email"},user_metadata:{},created_at:new Date().toISOString()});return;}
  if(url.pathname.startsWith("/rest/v1/rpc/")){
   let raw="";for await(const chunk of req)raw+=chunk;
   const b=JSON.parse(raw),name=url.pathname.split("/").pop();
   let result: { rows: Array<{ id: string }> };
   if(name==="create_single_wager") result=await db.query<{ id: string }>("select public.create_single_wager($1,$2,$3::jsonb) id",[b.p_user_id,b.p_idempotency_key,JSON.stringify(b.p_selection)]);
   else if(name==="create_parlay_wager")result=await db.query<{ id: string }>("select public.create_parlay_wager($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb) id",[b.p_user_id,b.p_user_name,b.p_stake,b.p_idempotency_key,b.p_combined_american_odds,b.p_combined_decimal_odds,b.p_potential_return,b.p_potential_profit,JSON.stringify(b.p_legs)]);
   else {send({message:"Unsupported test RPC"},404);return;}
   send(result.rows[0].id);return;
  }
  const table=url.pathname.split("/").pop()!;
  if(!["games","profiles","picks","parlay_wagers","wager_records"].includes(table)){send([]);return;}
  const result=await db.query<Record<string,unknown>>(`select * from public.${table}`);
  let rows=result.rows;
  for(const [column,value]of url.searchParams){if(value.startsWith("eq.")&&["id","user_id","sport","status"].includes(column))rows=rows.filter(r=>String(r[column])===value.slice(3));}
  if(table==="picks")for(const row of rows)row.game=(await db.query("select * from public.games where id=$1",[row.game_id])).rows[0];
  if(table==="parlay_wagers")for(const row of rows){row.legs=(await db.query("select * from public.parlay_legs where parlay_id=$1",[row.id])).rows;for(const leg of row.legs as Record<string,unknown>[])leg.game=(await db.query("select * from public.games where id=$1",[leg.game_id])).rows[0];}
  // PostgREST numeric values are JSON numbers, not PostgreSQL wire strings.
  const numeric=new Set(["spread","spread_home","total","spread_odds_away","spread_odds_home","total_odds_over","total_odds_under","line","units","stake","combined_decimal_odds","potential_return","potential_profit","actual_return"]);
  const encode=(value:unknown):unknown=>value instanceof Date?value.toISOString():Array.isArray(value)?value.map(encode):value&&typeof value==="object"?Object.fromEntries(Object.entries(value).map(([k,v])=>[k,numeric.has(k)&&v!==null?Number(v):encode(v)])):value;
  const single=req.headers.accept?.includes("application/vnd.pgrst.object");
  send(encode(single?rows[0]??null:rows));
 }catch(error){send({message:error instanceof Error?error.message:"Fixture failure",code:"P0001"},400);}
});
server.listen(54329,"127.0.0.1",()=>process.stdout.write("Local Supabase fixture ready\n"));
async function stop(){server.close();await db.close();process.exit(0);}
process.on("SIGTERM",()=>void stop());process.on("SIGINT",()=>void stop());
