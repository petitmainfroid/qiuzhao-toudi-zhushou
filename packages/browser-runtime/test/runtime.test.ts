import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { callControl } from "../controlClient.js";
import { BrowserRuntime } from "../runtime.js";
import { readSession } from "../sessionStore.js";

const fakeBrowserScript = new URL("./fake-browser.js", import.meta.url).pathname.replace(/^\/(.:\/)/, "$1");

test("launches, disconnects, reconnects with a rotated capability, and shuts down cleanly", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "browser-runtime-integration-"));
  const profileDir = path.join(root, "dedicated-profile");
  const sessionFile = path.join(root, "session.json");
  const launch = await BrowserRuntime.launch({
    browser: {
      kind: "chrome",
      executablePath: process.execPath,
      commandPrefix: [fakeBrowserScript],
      source: "explicit"
    },
    profileDir,
    sessionFile,
    startupTimeoutMs: 5_000,
    targetUrl:
      "https://xiaomi.jobs.f.mioffice.cn/internship/resume/7663053400020879658/apply?private=removed"
  });

  const first = await readSession(sessionFile);
  assert.equal(first.status.state, "login-needed");
  assert.ok(first.status.cdpPort && first.status.cdpPort > 0);
  assert.ok(first.status.controlPort > 0);
  assert.equal(first.status.page?.pathPattern, "/internship/resume/:id/apply");
  assert.doesNotMatch(JSON.stringify(first), /private=removed/);
  assert.equal((await callControl(first, "GET", "/v1/status")).state, "login-needed");

  await launch.disconnect();
  await assert.rejects(callControl(first, "GET", "/v1/status"));
  const adopted = await BrowserRuntime.adopt({
    browser: {
      kind: "chrome",
      executablePath: process.execPath,
      commandPrefix: [fakeBrowserScript],
      source: "explicit"
    },
    profileDir,
    sessionFile,
    browserPid: first.status.browserPid!,
    cdpPort: first.status.cdpPort!
  });
  const second = await readSession(sessionFile);
  assert.equal(second.status.state, "ready");
  assert.notEqual(second.capability, first.capability);

  const stopped = await adopted.stop();
  assert.equal(stopped.state, "stopped");
  await new Promise((resolve) => setTimeout(resolve, 100));
  await assert.rejects(callControl(second, "GET", "/v1/status"));
  assert.equal((await readSession(sessionFile)).status.state, "stopped");
});
