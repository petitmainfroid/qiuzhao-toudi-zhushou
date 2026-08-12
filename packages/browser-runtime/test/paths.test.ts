import assert from "node:assert/strict";
import { mkdtemp, realpath } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { assertDedicatedProfileDir, normalizePageIdentity } from "../paths.js";

test("rejects a default profile and its descendants", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "browser-runtime-paths-"));
  const defaultDir = path.join(root, "Google", "Chrome", "User Data");
  await assert.rejects(
    assertDedicatedProfileDir(path.join(defaultDir, "Default"), [defaultDir]),
    /default_profile_forbidden/
  );
});

test("accepts a separate absolute profile", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "browser-runtime-paths-"));
  const profile = path.join(root, "recruitment-profile");
  assert.equal(await assertDedicatedProfileDir(profile, [path.join(root, "daily-profile")]), await realpath(profile));
});

test("normalizes identifiers and removes query and fragment", () => {
  assert.deepEqual(
    normalizePageIdentity(
      "https://xiaomi.jobs.f.mioffice.cn/internship/resume/7663053400020879658/apply?source=private#step"
    ),
    {
      safeUrl: "https://xiaomi.jobs.f.mioffice.cn/internship/resume/7663053400020879658/apply",
      origin: "https://xiaomi.jobs.f.mioffice.cn",
      pathPattern: "/internship/resume/:id/apply"
    }
  );
});
