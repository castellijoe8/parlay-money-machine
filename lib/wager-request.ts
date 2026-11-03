import { supabase } from "./supabase";
import type { Selection } from "./betting";

export async function placeSingle(selection: Selection, idempotencyKey: string) {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error("Please log in to place a wager.");
  const response = await fetch("/api/wagers", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
    body: JSON.stringify({ selection, idempotencyKey }),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error ?? "Could not place wager. Please try again.");
  return data as { id: string };
}
