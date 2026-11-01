import { createClient } from "@supabase/supabase-js";
import { createSupabaseAdminClient } from "./supabase-admin";
import { compatibilityError, isSelection, UUID, COMPATIBILITY_MESSAGES } from "./betting";

const errors: Record<string, string> = {
  ...COMPATIBILITY_MESSAGES,
  price_changed: "Odds or lines changed. Refresh the games and review your selection before trying again.",
  wagering_closed: "Wagering is closed for one or more games.",
  invalid_selection: "A selection does not match its game's available markets.",
  invalid_sport: "The selected sport does not match its game.",
  incompatible_selection: "These selections cannot be combined in the same parlay.",
  sgp_pricing_unavailable: "Same-game house payouts require the latest database migration. Your wager was not placed.",
  idempotency_conflict: "This submission key was already used for a different wager. Start a new selection.",
};
export async function handleWager(request: Request, parlay: boolean) {
  const token = request.headers.get("authorization")?.match(/^Bearer (.+)$/)?.[1];
  if (!token) return Response.json({ error: "Please log in to place a wager." }, { status: 401 });
  const admin = createSupabaseAdminClient();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!admin || !url || !key) return Response.json({ error: "Server configuration is incomplete." }, { status: 503 });
  try {
    const auth = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data: { user }, error } = await auth.auth.getUser(token);
    if (error || !user) return Response.json({ error: "Your session expired. Please log in again." }, { status: 401 });
    const body = await request.json();
    if (!body || typeof body !== "object" || typeof body.idempotencyKey !== "string" || !UUID.test(body.idempotencyKey)) return Response.json({ error: "Invalid submission key." }, { status: 400 });
    const selections: unknown[] = parlay ? body.selections : [body.selection];
    if (!Array.isArray(selections) || selections.length < (parlay ? 2 : 1) || selections.length > (parlay ? 20 : 1) || !selections.every(isSelection)) return Response.json({ error: "Invalid wager selections. Parlays need 2 to 20 valid selections." }, { status: 400 });
    const conflict = parlay ? compatibilityError(selections) : null;
    if (conflict) return Response.json({ error: conflict }, { status: 400 });
    // RPCs lock games, check replays before freshness, and compute prices. Never
    // take identity, stake, combined odds or payout from request JSON.
    const { data, error: saveError } = parlay
      ? await admin.rpc("create_parlay_wager", {
        p_user_id: user.id, p_user_name: "Player", p_stake: 1,
        p_idempotency_key: body.idempotencyKey, p_combined_american_odds: 0,
        p_combined_decimal_odds: 0, p_potential_return: 0, p_potential_profit: 0, p_legs: selections,
      })
      : await admin.rpc("create_single_wager", { p_user_id: user.id, p_idempotency_key: body.idempotencyKey, p_selection: selections[0] });
    if (saveError) {
      const code = Object.keys(errors).find((name) => saveError.message.includes(name));
      if (code) return Response.json({ error: errors[code] }, { status: ["price_changed", "wagering_closed", "idempotency_conflict"].includes(code) ? 409 : 400 });
      console.error("Wager persistence failed", { code: saveError.code });
      return Response.json({ error: "Unable to save wager. The database may require the wagering migration." }, { status: 503 });
    }
    return Response.json({ id: data }, { status: 201 });
  } catch (error) {
    if (error instanceof SyntaxError) return Response.json({ error: "Invalid request JSON." }, { status: 400 });
    return Response.json({ error: "Unable to submit wager. Please retry with the same slip." }, { status: 503 });
  }
}
