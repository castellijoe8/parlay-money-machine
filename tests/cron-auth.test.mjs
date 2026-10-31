import assert from "node:assert/strict";
import { test } from "node:test";
import { authorizeCron } from "../lib/cron-auth.ts";

test("maintenance routes require a configured secret and an exact bearer token", () => {
  const previous = process.env.CRON_SECRET;
  const request = (authorization) => new Request("http://localhost/api/sync-games", {
    headers: authorization === undefined ? {} : { authorization },
  });
  try {
    delete process.env.CRON_SECRET;
    assert.equal(authorizeCron(request()).status, 503);
    process.env.CRON_SECRET = "test-only-secret";
    assert.equal(authorizeCron(request()).status, 401);
    assert.equal(authorizeCron(request("Bearer wrong")).status, 401);
    assert.equal(authorizeCron(request("Bearer test-only-secrex")).status, 401);
    assert.equal(authorizeCron(request("Basic test-only-secret")).status, 401);
    assert.equal(authorizeCron(request("Bearer test-only-secret")), null);
  } finally {
    if (previous === undefined) delete process.env.CRON_SECRET;
    else process.env.CRON_SECRET = previous;
  }
});
