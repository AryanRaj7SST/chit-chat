import assert from "node:assert/strict";
import http from "node:http";
import { once } from "node:events";
import test from "node:test";
import { parseClientOrigins } from "../src/config/cors.js";
import { initSocket } from "../src/socket/index.js";

test("origin lists trim whitespace, trailing slashes, duplicates and empty entries", () => {
  assert.deepEqual(parseClientOrigins(" https://first.example/ , https://second.example///, ,https://first.example "),
    ["https://first.example", "https://second.example"]);
  assert.deepEqual(parseClientOrigins(), []);
});

test("REST and Socket.IO polling share the same CORS allowlist", async () => {
  const previous = process.env.CLIENT_URL;
  process.env.CLIENT_URL = " https://first.example/ , https://second.example/// ";
  const { default: app } = await import("../src/app.js");
  const server = http.createServer(app);
  const io = initSocket(server);
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    for (const origin of ["https://first.example", "https://second.example"]) {
      for (const path of ["/api/health", "/socket.io/?EIO=4&transport=polling"]) {
        const response = await fetch(base + path, { headers: { Origin: origin } });
        assert.equal(response.status, 200);
        assert.equal(response.headers.get("access-control-allow-origin"), origin);
        assert.equal(response.headers.get("access-control-allow-credentials"), "true");
        await response.text();
      }
      const preflight = await fetch(base + "/api/auth/register", {
        method: "OPTIONS", headers: { Origin: origin, "Access-Control-Request-Method": "POST", "Access-Control-Request-Headers": "authorization,content-type" },
      });
      assert.equal(preflight.status, 204);
      assert.equal(preflight.headers.get("access-control-allow-origin"), origin);
    }
    for (const path of ["/api/health", "/socket.io/?EIO=4&transport=polling"]) {
      const denied = await fetch(base + path, { headers: { Origin: "https://unlisted.example" } });
      assert.equal(denied.headers.get("access-control-allow-origin"), null);
      await denied.text();
    }
    const health = await fetch(base + "/api/health");
    assert.equal(health.status, 200);
    assert.equal((await health.json()).message, "API is running");
  } finally {
    await new Promise((resolve) => io.close(resolve));
    if (previous === undefined) delete process.env.CLIENT_URL;
    else process.env.CLIENT_URL = previous;
  }
});
