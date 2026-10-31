import { handleWager } from "@/lib/wager-api";
export const runtime = "nodejs";
export async function POST(request: Request) { return handleWager(request, true); }
