import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";

test("weekly lock persistence enforces ownership, weekly eligibility, and kickoff finality", async () => {
  const db = new PGlite();
  try {
    await db.exec(await readFile(new URL("./fixtures/core-schema.sql", import.meta.url), "utf8"));
    await db.exec(await readFile(new URL("../supabase/migrations/20261105000000_weekly_locks.sql", import.meta.url), "utf8"));
    const user = "10000000-0000-4000-8000-000000000001";
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [user]);
    const game = "20000000-0000-4000-8000-000000000001";
    const pick = "30000000-0000-4000-8000-000000000001";
    await db.query("insert into public.games(id,sport,status,starts_at) values($1,'nfl','scheduled',now()+interval '1 minute')", [game]);
    await db.query("insert into public.picks(id,user_id,game_id,pick,result) values($1,$2,$3,'Over','pending')", [pick,user,game]);
    await db.query("select public.choose_weekly_lock($1)",[pick]);
    await db.query("select public.choose_weekly_lock($1)",[pick]);
    assert.equal((await db.query("select * from public.weekly_locks")).rows.length,1);
    await db.query("select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000002',false)");
    await assert.rejects(db.query("select public.choose_weekly_lock($1)",[pick]), /one of your single wagers/);
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [user]);
    await db.query("update public.games set starts_at=now()-interval '1 minute' where id=$1",[game]);
    await assert.rejects(db.query("select public.choose_weekly_lock($1)",[pick]), /upcoming game/);
  } finally { await db.close(); }
});

test("three-unit settlement uses original odds and is repeatable", async () => {
  const db = new PGlite();
  try {
    await db.exec(await readFile(new URL("./fixtures/core-schema.sql", import.meta.url), "utf8"));
    await db.exec(await readFile(new URL("../supabase/migrations/20261105000000_weekly_locks.sql", import.meta.url), "utf8"));
    // Stub the existing production grader's output to isolate the multiplier.
    await db.exec(`create or replace function public.score_game(uuid) returns void language sql as $$
      update public.picks set units=case result when 'win' then 0.91 when 'loss' then -1 else 0 end where game_id=$1
    $$;`);
    await db.exec(await readFile(new URL("../supabase/migrations/20261125000000_three_unit_weekly_locks.sql", import.meta.url), "utf8"));
    const user="10000000-0000-4000-8000-000000000001";
    for (const [i,result,odds,expected] of [[1,"win",-110,2.73],[2,"win",150,4.5],[3,"loss",-110,-3],[4,"push",-110,0]] as const) {
      const game="20000000-0000-4000-8000-00000000000"+i;
      const pick="30000000-0000-4000-8000-00000000000"+i;
      await db.query("insert into public.games(id,status) values($1,'final')",[game]);
      await db.query("insert into public.picks(id,user_id,game_id,result,odds) values($1,$2,$3,$4,$5)",[pick,user,game,result,odds]);
      await db.query("insert into public.weekly_locks(user_id,week_start,pick_id) values($1,date '2026-01-06'+$2::integer*7,$3)",[user,i,pick]);
      for(let repeat=0;repeat<2;repeat++){
        await db.query("select public.score_game($1)",[game]);
        const row=await db.query<{units:string}>("select units from public.picks where id=$1",[pick]);
        assert.equal(Number(row.rows[0].units),expected);
      }
    }
  } finally { await db.close(); }
});
