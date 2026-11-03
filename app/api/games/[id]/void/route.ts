import { authorizeCron } from "@/lib/cron-auth";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import { UUID } from "@/lib/betting";

// Operations-only: callers must explicitly identify permanent cancellations.
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const denied = authorizeCron(request);
  if (denied) return denied;
  const { id } = await context.params;
  if (!UUID.test(id)) return Response.json({ error: "Invalid game ID." }, { status: 400 });
  let body;
  try { body = await request.json(); } catch { return Response.json({ error: "Invalid JSON." }, { status: 400 }); }
  if (body?.permanent !== true || typeof body?.reason !== "string" || body.reason.trim().length < 10) {
    return Response.json({ error: "Confirm permanent cancellation/postponement and provide a reason of at least 10 characters." }, { status: 400 });
  }
  const admin = createSupabaseAdminClient();
  if (!admin) return Response.json({ error: "Server configuration is incomplete." }, { status: 503 });
  const { error } = await admin.rpc("void_game_wagers", { p_game_id: id, p_reason: body.reason });
  if (error) return Response.json({ error: "Unable to void game wagers." }, { status: 503 });
  return Response.json({ success: true });
}
