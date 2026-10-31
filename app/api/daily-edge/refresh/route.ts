import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import { isDailyEdgeRefreshAuthorized } from "@/lib/daily-edge-refresh";
import { GET as getDailyEdge } from "@/app/api/daily-edge/route";

async function refresh(request: Request, trigger: "scheduled" | "manual") {
  const secret = process.env.CRON_SECRET;
  if (!isDailyEdgeRefreshAuthorized(request.headers.get("authorization"), secret)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const client = createSupabaseAdminClient();
  if (!client) return NextResponse.json({ error: "Supabase server configuration is incomplete" }, { status: 500 });

  const { data: run, error: insertError } = await client.from("daily_edge_runs").insert({ status: "running", trigger }).select("id").single();
  if (insertError || !run) {
    console.error("Could not start Daily Edge refresh run:", insertError);
    return NextResponse.json({ error: "Daily Edge run tracking is unavailable" }, { status: 503 });
  }

  try {
    const endpoint = new URL("/api/daily-edge", request.url);
    const response = await getDailyEdge(new Request(endpoint));
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error ?? "Daily Edge calculation failed");
    const { error: updateError } = await client.from("daily_edge_runs").update({
      status: "succeeded",
      finished_at: new Date().toISOString(),
      window_start: payload.window.start,
      window_end: payload.window.end,
      games_analyzed: payload.weeklyGameCount,
      nuggets_count: payload.insights.length,
    }).eq("id", run.id);
    if (updateError) throw updateError;
    return NextResponse.json({ success: true, runId: run.id, trigger, window: payload.window, gamesAnalyzed: payload.weeklyGameCount, nuggets: payload.insights.length });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Daily Edge calculation failed";
    const { error: updateError } = await client.from("daily_edge_runs").update({ status: "failed", finished_at: new Date().toISOString(), error_message: message }).eq("id", run.id);
    if (updateError) console.error("Could not record Daily Edge refresh failure:", updateError);
    console.error("Daily Edge refresh failed:", error);
    return NextResponse.json({ error: message, runId: run.id }, { status: 500 });
  }
}

export async function GET(request: Request) {
  return refresh(request, "scheduled");
}

export async function POST(request: Request) {
  return refresh(request, "manual");
}
