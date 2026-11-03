import { timingSafeEqual } from "node:crypto";

export function authorizeCron(request: Request): Response | null {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return Response.json({ error: "CRON_SECRET is not configured" }, { status: 503 });
  }

  const actual = Buffer.from(request.headers.get("authorization") ?? "");
  const expected = Buffer.from(`Bearer ${secret}`);
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  return null;
}
