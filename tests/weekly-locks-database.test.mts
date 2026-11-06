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
