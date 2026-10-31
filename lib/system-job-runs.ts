import type { SupabaseClient } from "@supabase/supabase-js";

export async function startSystemJobRun(client: SupabaseClient, job: "odds" | "scores") {
  const { data, error } = await client.from("system_job_runs").insert({ job, status: "running" }).select("id").single();
  if (error) {
    console.error(`Could not start ${job} sync tracking:`, error);
    return null;
  }
  return data.id as number;
}

export async function finishSystemJobRun(
  client: SupabaseClient,
  id: number | null,
  status: "succeeded" | "failed",
  details: Record<string, unknown>,
) {
  if (id === null) return;
  const { error } = await client.from("system_job_runs").update({
    status,
    finished_at: new Date().toISOString(),
    ...(status === "succeeded" ? { summary: details } : { error_message: String(details.error ?? "Sync failed") }),
  }).eq("id", id);
  if (error) console.error("Could not finish sync tracking:", error);
}
