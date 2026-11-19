import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import cors from "cors";
import { request } from "node:http";
import { browserAccessControl, isAllowedOrigin, parseAllowedOrigins } from "../middleware/browserAccess.js";

async function fixture(policy: express.RequestHandler, run: (base: string, hits: () => number) => Promise<void>) {
  const app = express(); let called = 0;
  app.use(policy);
  app.use(express.json());
  app.all("/fixture", (_req, res) => { called++; res.json({ synthetic: true }); });
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>((resolve) => server.once("listening", resolve));
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  try { await run(`http://127.0.0.1:${address.port}`, () => called); }
  finally { await new Promise<void>((resolve, reject) => server.close((err) => err ? reject(err) : resolve())); }
}

test("baseline unrestricted CORS exposes a synthetic route to an arbitrary site", async () => {
  await fixture(cors(), async (base) => {
    const response = await fetch(`${base}/fixture`, { headers: { Origin: "https://untrusted.invalid" } });
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("access-control-allow-origin"), "*");
  });
});

test("untrusted browser GET, POST and preflight never reach a route", async () => {
  await fixture(browserAccessControl(), async (base, hits) => {
    for (const method of ["GET", "POST", "OPTIONS"]) {
      const response = await fetch(`${base}/fixture`, {
        method, headers: { Origin: "https://untrusted.invalid", "Content-Type": "application/json" },
        ...(method === "POST" ? { body: "{" } : {})
      });
      assert.equal(response.status, 403);
      assert.equal(response.headers.get("access-control-allow-origin"), null);
    }
    assert.equal(hits(), 0);
  });
});

test("dev UI, native origins, same-origin backend and non-browser clients stay usable", async () => {
  await fixture(browserAccessControl(), async (base, hits) => {
    for (const origin of ["http://localhost:3000", "http://127.0.0.1:3000", "http://[::1]:3000", "http://localhost:5173", "http://127.0.0.1:5173", "capacitor://localhost",
      "http://localhost", "https://localhost", base]) {
      const response = await fetch(`${base}/fixture`, { headers: { Origin: origin } });
      assert.equal(response.status, 200, origin);
      assert.equal(response.headers.get("access-control-allow-origin"), origin);
      assert.ok(response.headers.get("vary")?.includes("Origin"));
    }
    assert.equal((await fetch(`${base}/fixture`)).status, 200);
    assert.equal(hits(), 10);
  });
});

test("allowed preflight finishes without invoking a side-effect route", async () => {
  await fixture(browserAccessControl(), async (base, hits) => {
    const response = await fetch(`${base}/fixture`, { method: "OPTIONS",
      headers: { Origin: "capacitor://localhost", "Access-Control-Request-Method": "POST",
        "Access-Control-Request-Headers": "content-type,x-openai-key" } });
    assert.equal(response.status, 204);
    assert.ok(response.headers.get("access-control-allow-headers")?.includes("x-openai-key"));
    assert.equal(hits(), 0);
  });
});

test("opaque, malformed and look-alike origins and cross-site no-Origin requests fail closed", async () => {
  await fixture(browserAccessControl(), async (base, hits) => {
    for (const origin of ["null", "not-a-url", "https://localhost.untrusted.invalid", "http://localhost:5173/",
      "capacitor://untrusted.invalid", "http://localhost:51730", "http://localhost:5173@untrusted.invalid"]) {
      assert.equal((await fetch(`${base}/fixture`, { headers: { Origin: origin } })).status, 403, origin);
    }
    assert.equal((await fetch(`${base}/fixture`, { headers: { "Sec-Fetch-Site": "cross-site" } })).status, 403);
    assert.equal(hits(), 0);
  });
});

test("custom frontend origins require an exact explicit entry", async () => {
  await fixture(browserAccessControl("http://192.168.1.10:5173"), async (base) => {
    for (const [origin, expected] of [["http://192.168.1.10:5173", 200], ["http://192.168.1.11:5173", 403],
      ["https://192.168.1.10:5173", 403], ["http://192.168.1.10:5174", 403]] as const) {
      assert.equal((await fetch(`${base}/fixture`, { headers: { Origin: origin } })).status, expected);
    }
  });
});

test("same-origin trusted-LAN host checks do not trust arbitrary Host names", () => {
  const allowed = parseAllowedOrigins();
  for (const host of ["192.168.1.10:3050", "10.0.0.2:3050", "172.16.1.2:3050", "172.31.0.1:3050",
    "127.0.0.1:3050", "[::1]:3050", "localhost:3050"]) {
    assert.equal(isAllowedOrigin(`http://${host}`, { protocol: "http", get: () => host } as never, allowed), true, host);
  }
  for (const host of ["untrusted.invalid:3050", "172.32.0.1:3050", "8.8.8.8:3050", "192.168.999.1:3050"]) {
    assert.equal(isAllowedOrigin(`http://${host}`, { protocol: "http", get: () => host } as never, allowed), false, host);
  }
});

test("origin configuration rejects wildcards, credentials, paths and opaque URLs", () => {
  for (const input of ["*", "null", "https://*.example.invalid", "https://a.invalid/path", "https://a.invalid?q=1",
    "https://a.invalid/#x", "https://u:p@a.invalid", "data:text/plain,x", "file:///tmp/x", "capacitor://other"]) {
    assert.throws(() => parseAllowedOrigins(input), { name: /Error/ }, input);
  }
  assert.ok(parseAllowedOrigins(" https://app.example.invalid/ , http://192.168.1.10:5173 ").has("https://app.example.invalid"));
});

 test("untrusted Host headers are rejected even without Origin (DNS rebinding boundary)", async () => {
  await fixture(browserAccessControl(), async (base, hits) => {
   for (const host of ["untrusted.invalid:3050", "localhost.untrusted.invalid:3050", "8.8.8.8:3050"]) {
    const status = await new Promise<number>((resolve, reject) => {
     const req = request(`${base}/fixture`, { headers: { Host: host } }, (res) => {
      res.resume();res.on("end", () => resolve(res.statusCode || 0));
     });req.on("error", reject);req.end();
    });
    assert.equal(status, 403, host);
   }
   assert.equal(hits(), 0);
  });
 });


test("trusted cross-site media requests require a checkable Origin", async () => {
  const origin = "https://app.example.invalid";
  await fixture(browserAccessControl(origin), async (base, hits) => {
    const allowed = await fetch(`${base}/fixture`, { headers: { Origin: origin, "Sec-Fetch-Site": "cross-site" } });
    assert.equal(allowed.status, 200);
    assert.equal(allowed.headers.get("access-control-allow-origin"), origin);
    assert.equal((await fetch(`${base}/fixture`, { headers: { "Sec-Fetch-Site": "cross-site" } })).status, 403);
    assert.equal(hits(), 1);
  });
});
