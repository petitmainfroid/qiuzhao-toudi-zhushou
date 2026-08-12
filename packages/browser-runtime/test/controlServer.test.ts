import assert from "node:assert/strict";
import http from "node:http";
import test from "node:test";
import { CapabilityControlServer } from "../controlServer.js";
import type { BrowserRuntimeStatus } from "../types.js";

const status: BrowserRuntimeStatus = {
  launchId: "launch",
  state: "ready",
  browser: "chrome",
  profileDir: "C:\\dedicated",
  controlPort: 0,
  startedAt: "2026-08-12T00:00:00.000Z"
};

async function request(port: number, token?: string): Promise<number> {
  return await new Promise<number>((resolve, reject) => {
    const req = http.get(
      {
        host: "127.0.0.1",
        port,
        path: "/v1/status",
        headers: token ? { authorization: `Bearer ${token}` } : undefined
      },
      (response) => {
        response.resume();
        response.on("end", () => resolve(response.statusCode ?? 0));
      }
    );
    req.on("error", reject);
  });
}

test("binds dynamically to loopback and rejects missing or wrong capabilities", async () => {
  const server = new CapabilityControlServer("correct-capability", {
    getStatus: () => status,
    stop: async () => status
  });
  const port = await server.start();
  assert.ok(port > 0);
  assert.equal(await request(port), 401);
  assert.equal(await request(port, "wrong-capability"), 401);
  assert.equal(await request(port, "correct-capability"), 200);
  await server.close();
  await assert.rejects(request(port, "correct-capability"));
});
