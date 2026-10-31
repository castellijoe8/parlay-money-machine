import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  const admin = createSupabaseAdminClient();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!admin || !url || !key) return NextResponse.json({ error: "Server configuration is incomplete." }, { status: 500 });
  if (!token) return NextResponse.json({ error: "Please log in." }, { status: 401 });
  const auth = createClient(url, key);
  const { data: { user } } = await auth.auth.getUser(token);
  if (!user) return NextResponse.json({ error: "Please log in." }, { status: 401 });
  const { id } = await context.params;
  const { data: existing, error: readError } = await admin.from("parlay_wagers").select("share_token").eq("id", id).eq("user_id", user.id).maybeSingle();
  if (readError || !existing) return NextResponse.json({ error: "Parlay not found." }, { status: 404 });
  let shareToken = existing.share_token as string | null;
  if (!shareToken) {
    shareToken = crypto.randomUUID();
    const { error } = await admin.from("parlay_wagers").update({ share_token: shareToken }).eq("id", id).eq("user_id", user.id);
    if (error) return NextResponse.json({ error: "Could not create a share link." }, { status: 500 });
  }
  return NextResponse.json({ url: `${new URL(request.url).origin}/parlay/share/${shareToken}` });
}
