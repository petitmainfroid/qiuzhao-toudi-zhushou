import { createHash } from "node:crypto";
import { request as httpRequest } from "node:http";
import { afterEach, describe, expect, it } from "vitest";
import { createEmptyProfile, type CandidateProfile } from "../../../shared/domain/profile";
import {
  ProfileHostConflictError,
  PROFILE_HOST_LIMITS,
  startProfileHost,
  type ProfileHostHandle,
  type ProfileHostImportCoordinator,
  type ProfileHostSnapshot,
  type ProfileHostStore
} from "../src";

function etag(revision: string): string {
  return `"${createHash("sha256").update(revision).digest("base64url")}"`;
}

class MemoryStore implements ProfileHostStore {
  snapshot: ProfileHostSnapshot = { profile: createEmptyProfile(), revision: "revision-1" };

  async load(): Promise<ProfileHostSnapshot> {
    return structuredClone(this.snapshot);
  }

  async save(input: { profile: CandidateProfile; expectedRevision: string }): Promise<ProfileHostSnapshot> {
    if (input.expectedRevision !== this.snapshot.revision) throw new ProfileHostConflictError();
    this.snapshot = { profile: structuredClone(input.profile), revision: "revision-2" };
    return this.load();
  }

  async clear(input: { expectedRevision: string }): Promise<ProfileHostSnapshot> {
    if (input.expectedRevision !== this.snapshot.revision) throw new ProfileHostConflictError();
    this.snapshot = { profile: createEmptyProfile(), revision: "revision-cleared" };
    return this.load();
  }
}

const hosts: ProfileHostHandle[] = [];

afterEach(async () => {
  await Promise.all(hosts.splice(0).map((host) => host.stop()));
});

async function launch(options: { now?: () => number; sessionTtlMs?: number; localData?: ProfileHostImportCoordinator } = {}) {
  const store = new MemoryStore();
  const host = await startProfileHost({
    store,
    ui: {
      indexHtml: '<!doctype html><div id="root"></div><script src="/assets/profile-host.js"></script>',
      assets: {
        "/assets/profile-host.js": { body: "globalThis.profileHostLoaded=true", contentType: "text/javascript" },
        "/assets/profile-host.css": { body: ":root{color:#606c38}", contentType: "text/css" }
      }
    },
    ...options
  });
  hosts.push(host);
  return { host, store };
}

async function bootstrap(host: ProfileHostHandle): Promise<{ cookie: string; csrf: string }> {
  const bootstrapUrl = new URL(host.bootstrapUrl);
  const token = bootstrapUrl.hash.slice(1);
  const response = await fetch(`${host.origin}/api/bootstrap`, {
    method: "POST",
    headers: { Origin: host.origin, "Content-Type": "application/json" },
    body: JSON.stringify({ token })
  });
  expect(response.status).toBe(200);
  const cookie = response.headers.get("set-cookie")?.split(";", 1)[0];
  expect(cookie).toBeTruthy();
  const sessionResponse = await fetch(`${host.origin}/api/session`, { headers: { Cookie: cookie! } });
  const session = (await sessionResponse.json()) as { csrfToken: string };
  return { cookie: cookie!, csrf: session.csrfToken };
}

describe("loopback profile host", () => {
  it("binds a dynamic IPv4 loopback port and protects every resource except the minimal bootstrap shell", async () => {
    const { host } = await launch();
    expect(host.origin).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/);
    expect(host.bootstrapUrl).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/bootstrap#[A-Za-z0-9_-]+$/);
    expect(host.bootstrapUrl).not.toContain("?");

    for (const path of ["/", "/assets/profile-host.js", "/assets/profile-host.css", "/api/session", "/api/profile"]) {
      const response = await fetch(`${host.origin}${path}`);
      expect(response.status, path).toBe(401);
      expect(response.headers.get("cache-control")).toContain("no-store");
      expect(response.headers.get("content-security-policy")).toContain("frame-ancestors 'none'");
    }
    const invalidHost = await new Promise<number>((resolve, reject) => {
      const request = httpRequest({
        host: "127.0.0.1",
        port: host.port,
        method: "GET",
        path: "/bootstrap",
        headers: { Host: "localhost" }
      }, (incoming) => {
        incoming.resume();
        incoming.on("end", () => resolve(incoming.statusCode ?? 0));
      });
      request.once("error", reject);
      request.end();
    });
    expect(invalidHost).toBe(421);

    const shell = await fetch(`${host.origin}/bootstrap`);
    const shellBody = await shell.text();
    expect(shell.status).toBe(200);
    expect(shellBody).toContain("history.replaceState");
    expect(shellBody).not.toContain(new URL(host.bootstrapUrl).hash.slice(1));
    expect(shell.headers.get("content-security-policy")).toMatch(/script-src 'nonce-[A-Za-z0-9_-]+'/);
    expect(shell.headers.get("content-security-policy")).toContain("object-src 'none'");
  });

  it("exchanges a short-lived fragment token once for a strict HttpOnly session", async () => {
    const { host } = await launch();
    const token = new URL(host.bootstrapUrl).hash.slice(1);
    const missingOrigin = await fetch(`${host.origin}/api/bootstrap`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token })
    });
    expect(missingOrigin.status).toBe(403);

    const response = await fetch(`${host.origin}/api/bootstrap`, {
      method: "POST",
      headers: { Origin: host.origin, "Content-Type": "application/json" },
      body: JSON.stringify({ token })
    });
    const responseText = await response.text();
    const setCookie = response.headers.get("set-cookie") ?? "";
    expect(response.status).toBe(200);
    expect(setCookie).toContain("HttpOnly");
    expect(setCookie).toContain("SameSite=Strict");
    expect(setCookie).toContain("Path=/");
    expect(responseText).not.toContain(token);

    const replay = await fetch(`${host.origin}/api/bootstrap`, {
      method: "POST",
      headers: { Origin: host.origin, "Content-Type": "application/json" },
      body: JSON.stringify({ token })
    });
    expect(replay.status).toBe(410);
  });

  it("expires an unused bootstrap capability and rejects absolute-form cross-origin targets", async () => {
    let currentTime = 1_000;
    const { host } = await launch({ now: () => currentTime });
    currentTime += 60_001;
    expect((await fetch(`${host.origin}/bootstrap`)).status).toBe(410);

    const response = await new Promise<{ status: number; body: string }>((resolve, reject) => {
      const request = httpRequest({
        host: "127.0.0.1",
        port: host.port,
        method: "GET",
        path: "http://attacker.invalid/bootstrap",
        headers: { Host: `127.0.0.1:${host.port}` }
      }, (incoming) => {
        const chunks: Buffer[] = [];
        incoming.on("data", (chunk: Buffer) => chunks.push(chunk));
        incoming.on("end", () => resolve({ status: incoming.statusCode ?? 0, body: Buffer.concat(chunks).toString("utf8") }));
      });
      request.once("error", reject);
      request.end();
    });
    expect(response.status).toBe(421);
    expect(response.body).not.toContain("attacker.invalid");
  });

  it("enforces session, origin, csrf and current If-Match before mutation", async () => {
    const { host, store } = await launch();
    const { cookie, csrf } = await bootstrap(host);
    const loaded = await fetch(`${host.origin}/api/profile`, { headers: { Cookie: cookie } });
    const loadedBody = (await loaded.json()) as { profile: CandidateProfile };
    expect(loaded.headers.get("etag")).toBe(etag("revision-1"));

    const request = (headers: Record<string, string>, body: unknown = { profile: loadedBody.profile }) =>
      fetch(`${host.origin}/api/profile`, {
        method: "PUT",
        headers: { Cookie: cookie, "Content-Type": "application/json", ...headers },
        body: JSON.stringify(body)
      });
    expect((await request({ "X-Profile-CSRF": csrf, "If-Match": etag("revision-1") })).status).toBe(403);
    expect((await request({ Origin: host.origin, "If-Match": etag("revision-1") })).status).toBe(403);
    expect((await request({ Origin: host.origin, "X-Profile-CSRF": csrf })).status).toBe(428);
    expect((await request({ Origin: host.origin, "X-Profile-CSRF": csrf, "If-Match": etag("stale") })).status).toBe(409);

    const saved = await request({ Origin: host.origin, "X-Profile-CSRF": csrf, "If-Match": etag("revision-1") });
    expect(saved.status).toBe(200);
    expect(saved.headers.get("etag")).toBe(etag("revision-2"));
    expect(store.snapshot.revision).toBe("revision-2");
  });

  it("rejects unknown profile fields and oversized request bodies without modifying the store", async () => {
    const { host, store } = await launch();
    const token = new URL(host.bootstrapUrl).hash.slice(1);
    const oversized = await fetch(`${host.origin}/api/bootstrap`, {
      method: "POST",
      headers: { Origin: host.origin, "Content-Type": "application/json" },
      body: JSON.stringify({ token: `${token}${"x".repeat(5000)}` })
    });
    expect(oversized.status).toBe(413);
    const { cookie, csrf } = await bootstrap(host);
    const profile = { ...store.snapshot.profile, unexpected: "must not pass" };
    const invalid = await fetch(`${host.origin}/api/profile`, {
      method: "PUT",
      headers: {
        Cookie: cookie,
        Origin: host.origin,
        "Content-Type": "application/json",
        "X-Profile-CSRF": csrf,
        "If-Match": etag("revision-1")
      },
      body: JSON.stringify({ profile })
    });
    expect(invalid.status).toBe(422);
    expect(store.snapshot.revision).toBe("revision-1");

  });

  it("expires, revokes, and fully closes the listener", async () => {
    let currentTime = 1_000;
    const { host } = await launch({ now: () => currentTime, sessionTtlMs: 100 });
    const { cookie } = await bootstrap(host);
    currentTime += 101;
    expect((await fetch(`${host.origin}/api/session`, { headers: { Cookie: cookie } })).status).toBe(401);
    host.revoke();
    expect((await fetch(`${host.origin}/bootstrap`)).status).toBe(410);
    await host.stop();
    expect(host.listening).toBe(false);
    await expect(fetch(`${host.origin}/`)).rejects.toThrow();
  });

  it("bounds configured TTL/body limits and emits no permissive CORS headers", async () => {
    const store = new MemoryStore();
    const ui = { indexHtml: "<main></main>", assets: {} };
    await expect(startProfileHost({ store, ui, bootstrapTtlMs: 300_001 })).rejects.toThrow("bounded");
    await expect(startProfileHost({ store, ui, sessionTtlMs: 86_400_001 })).rejects.toThrow("bounded");
    await expect(startProfileHost({ store, ui, maxRequestBodyBytes: 2_097_153 })).rejects.toThrow("bounded");
    const { host } = await launch();
    const response = await fetch(`${host.origin}/bootstrap`);
    expect(response.headers.get("access-control-allow-origin")).toBeNull();
    expect(PROFILE_HOST_LIMITS).toEqual(expect.objectContaining({
      requestTimeoutMs: 15_000,
      headersTimeoutMs: 10_000,
      keepAliveTimeoutMs: 5_000
    }));
  });

  it("authenticates migration APIs and binds confirm/rollback writes to ETags", async () => {
    let store!: MemoryStore;
    const localData: ProfileHostImportCoordinator = {
      async exportData() { return { serialized: "synthetic-export", suggestedFileName: "profile.json" }; },
      async previewImport() {
        return {
          confirmationToken: `import_${"i".repeat(43)}`,
          expiresAt: "2026-08-13T00:05:00.000Z",
          expectedCurrentProfileVersion: "revision-1",
          sourceFormat: "profile-service-v1",
          authenticityVerified: false,
          changedPathCount: 1,
          conflictPathCount: 0,
          changedPaths: ["basic.fullName"],
          conflictPaths: [],
          pathsTruncated: false
        };
      },
      async confirmImport() {
        store.snapshot = { profile: createEmptyProfile(), revision: "revision-2" };
        return {
          snapshot: await store.load(),
          rollback: {
            rollbackToken: `rollback_${"r".repeat(43)}`,
            expiresAt: "2026-08-13T00:05:00.000Z",
            expectedImportedProfileVersion: "revision-2"
          }
        };
      },
      async rollbackImport() {
        store.snapshot = { profile: createEmptyProfile(), revision: "revision-3" };
        return { snapshot: await store.load() };
      }
    };
    const launched = await launch({ localData });
    store = launched.store;
    const { host } = launched;
    expect((await fetch(`${host.origin}/api/profile/export`)).status).toBe(401);
    const { cookie, csrf } = await bootstrap(host);
    const common = { Cookie: cookie, Origin: host.origin, "Content-Type": "application/json", "X-Profile-CSRF": csrf };
    const exported = await fetch(`${host.origin}/api/profile/export`, { headers: { Cookie: cookie } });
    expect(await exported.json()).toEqual({ serialized: "synthetic-export", suggestedFileName: "profile.json" });

    const previewResponse = await fetch(`${host.origin}/api/profile/import/preview`, {
      method: "POST", headers: common, body: JSON.stringify({ serialized: "input" })
    });
    const preview = await previewResponse.json() as Record<string, unknown>;
    expect(previewResponse.status).toBe(200);
    expect(preview).not.toHaveProperty("sourceDigest");
    expect(preview).not.toHaveProperty("summaryDigest");
    expect(store.snapshot.revision).toBe("revision-1");
    const invalidPreview = await fetch(`${host.origin}/api/profile/import/preview`, {
      method: "POST", headers: common, body: JSON.stringify({ serialized: "input", unknown: true })
    });
    expect(invalidPreview.status).toBe(400);

    const confirmBody = JSON.stringify({
      confirmationToken: preview.confirmationToken,
      expectedCurrentProfileVersion: "revision-1",
      serialized: "input"
    });
    expect((await fetch(`${host.origin}/api/profile/import/confirm`, {
      method: "POST", headers: common, body: confirmBody
    })).status).toBe(428);
    expect((await fetch(`${host.origin}/api/profile/import/confirm`, {
      method: "POST", headers: { ...common, "If-Match": etag("stale") }, body: confirmBody
    })).status).toBe(409);
    const confirmed = await fetch(`${host.origin}/api/profile/import/confirm`, {
      method: "POST", headers: { ...common, "If-Match": etag("revision-1") }, body: confirmBody
    });
    const confirmation = await confirmed.json() as { rollback: { rollbackToken: string; expectedImportedProfileVersion: string } };
    expect(confirmed.headers.get("etag")).toBe(etag("revision-2"));

    const rolledBack = await fetch(`${host.origin}/api/profile/import/rollback`, {
      method: "POST",
      headers: { ...common, "If-Match": etag("revision-2") },
      body: JSON.stringify({
        rollbackToken: confirmation.rollback.rollbackToken,
        expectedImportedProfileVersion: confirmation.rollback.expectedImportedProfileVersion
      })
    });
    expect(rolledBack.status).toBe(200);
    expect(rolledBack.headers.get("etag")).toBe(etag("revision-3"));
  });
});
