import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import type { Socket } from "node:net";
import {
  ProfileHostConflictError,
  ProfilePayloadValidationError,
  type ProfileHostHandle,
  type ProfileHostOptions,
  type ProfileHostSnapshot,
  type ProfileHostUiAsset
} from "./contracts";
import { ProfileServiceError } from "../../profile-service/src";
import { validateCurrentProfilePayload } from "./profilePayload";

const LOOPBACK_HOST = "127.0.0.1";
const DEFAULT_BOOTSTRAP_TTL_MS = 60_000;
const DEFAULT_SESSION_TTL_MS = 15 * 60_000;
const DEFAULT_MAX_BODY_BYTES = 1024 * 1024;
const MAX_BOOTSTRAP_TTL_MS = 5 * 60_000;
const MAX_SESSION_TTL_MS = 24 * 60 * 60_000;
const MAX_BODY_BYTES = 2 * 1024 * 1024;
const COOKIE_NAME = "qiuzhao_profile_session";

export const PROFILE_HOST_LIMITS = Object.freeze({
  maxBootstrapTtlMs: MAX_BOOTSTRAP_TTL_MS,
  maxSessionTtlMs: MAX_SESSION_TTL_MS,
  maxRequestBodyBytes: MAX_BODY_BYTES,
  requestTimeoutMs: 15_000,
  headersTimeoutMs: 10_000,
  keepAliveTimeoutMs: 5_000
});

class RequestError extends Error {
  constructor(
    readonly status: number,
    readonly code: string
  ) {
    super(code);
    this.name = "RequestError";
  }
}

interface ActiveSession {
  idHash: Buffer;
  csrfToken: string;
  expiresAt: number;
  revoked: boolean;
}

function capability(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}

function digest(value: string): Buffer {
  return createHash("sha256").update(value, "utf8").digest();
}

function securelyEqual(left: Buffer, right: Buffer): boolean {
  return left.length === right.length && timingSafeEqual(left, right);
}

function jsonBody(value: unknown): string {
  return JSON.stringify(value);
}

function quotedEtag(revision: string): string {
  const digestRevision = createHash("sha256").update(revision, "utf8").digest("base64url");
  return `"${digestRevision}"`;
}

function bootstrapDocument(nonce: string): string {
  return `<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>本地求职档案</title></head>
<body><main id="status">正在打开本地档案…</main><script nonce="${nonce}">
(()=>{const status=document.getElementById("status");const token=location.hash.startsWith("#")?location.hash.slice(1):"";history.replaceState(null,"","/bootstrap");if(!token){status.textContent="启动链接已失效。";return;}fetch("/api/bootstrap",{method:"POST",credentials:"same-origin",headers:{"Content-Type":"application/json"},body:JSON.stringify({token})}).then(response=>{if(!response.ok)throw new Error("bootstrap");location.replace("/");}).catch(()=>{status.textContent="启动链接已失效。请返回本地工作台重试。";});})();
</script></body></html>`;
}

function requestPath(request: IncomingMessage, origin: string): string {
  let url: URL;
  try {
    url = new URL(request.url ?? "/", origin);
  } catch {
    throw new RequestError(400, "bad_request");
  }
  if (url.origin !== origin) {
    throw new RequestError(421, "invalid_request_target");
  }
  if (url.search !== "") {
    throw new RequestError(404, "not_found");
  }
  return url.pathname;
}

function cookies(request: IncomingMessage): Readonly<Record<string, string>> {
  const result: Record<string, string> = {};
  for (const part of (request.headers.cookie ?? "").split(";")) {
    const separator = part.indexOf("=");
    if (separator <= 0) continue;
    result[part.slice(0, separator).trim()] = part.slice(separator + 1).trim();
  }
  return result;
}

function readBody(request: IncomingMessage, maxBytes: number): Promise<Buffer> {
  const encoding = request.headers["content-encoding"];
  if (encoding !== undefined && encoding !== "identity") {
    throw new RequestError(415, "unsupported_media_type");
  }
  const declaredLength = Number(request.headers["content-length"] ?? 0);
  if (!Number.isFinite(declaredLength) || declaredLength < 0 || declaredLength > maxBytes) {
    throw new RequestError(413, "request_too_large");
  }
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let total = 0;
    request.on("data", (chunk: Buffer) => {
      total += chunk.byteLength;
      if (total > maxBytes) {
        reject(new RequestError(413, "request_too_large"));
        request.destroy();
        return;
      }
      chunks.push(chunk);
    });
    request.on("end", () => resolve(Buffer.concat(chunks)));
    request.on("error", reject);
  });
}

async function parseJson(request: IncomingMessage, maxBytes: number): Promise<unknown> {
  const mediaType = (request.headers["content-type"] ?? "").split(";", 1)[0]?.trim().toLowerCase();
  if (mediaType !== "application/json") {
    throw new RequestError(415, "unsupported_media_type");
  }
  const body = await readBody(request, maxBytes);
  try {
    return JSON.parse(body.toString("utf8"));
  } catch {
    throw new RequestError(400, "invalid_json");
  }
}

function exactObject(value: unknown, keys: string[]): value is Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  return actual.length === expected.length && actual.every((key, index) => key === expected[index]);
}

export async function startProfileHost(options: ProfileHostOptions): Promise<ProfileHostHandle> {
  const now = options.now ?? Date.now;
  const bootstrapTtlMs = options.bootstrapTtlMs ?? DEFAULT_BOOTSTRAP_TTL_MS;
  const sessionTtlMs = options.sessionTtlMs ?? DEFAULT_SESSION_TTL_MS;
  const maxBodyBytes = options.maxRequestBodyBytes ?? DEFAULT_MAX_BODY_BYTES;
  if (
    bootstrapTtlMs <= 0 || bootstrapTtlMs > MAX_BOOTSTRAP_TTL_MS ||
    sessionTtlMs <= 0 || sessionTtlMs > MAX_SESSION_TTL_MS ||
    maxBodyBytes < 1024 || maxBodyBytes > MAX_BODY_BYTES
  ) {
    throw new Error("Profile host limits must be positive and bounded.");
  }

  const bootstrapToken = capability();
  let bootstrapHash: Buffer | undefined = digest(bootstrapToken);
  const bootstrapExpiresAt = now() + bootstrapTtlMs;
  let session: ActiveSession | undefined;
  let origin = "";
  let expectedHost = "";
  let stopped = false;
  const sockets = new Set<Socket>();

  const server = createServer(async (request, response) => {
    try {
      applyBaseHeaders(response, standardCsp());
      if (stopped) throw new RequestError(410, "host_closed");
      if (request.headers.host !== expectedHost) throw new RequestError(421, "invalid_host");
      const path = requestPath(request, origin);

      if (request.method === "GET" && path === "/bootstrap") {
        if (bootstrapHash === undefined || now() >= bootstrapExpiresAt) {
          throw new RequestError(410, "bootstrap_unavailable");
        }
        const nonce = capability(18);
        applyBaseHeaders(response, bootstrapCsp(nonce));
        send(response, 200, bootstrapDocument(nonce), "text/html; charset=utf-8");
        return;
      }

      if (request.method === "POST" && path === "/api/bootstrap") {
        requireOrigin(request, origin);
        if (bootstrapHash === undefined || now() >= bootstrapExpiresAt) {
          throw new RequestError(410, "bootstrap_unavailable");
        }
        const value = await parseJson(request, Math.min(maxBodyBytes, 4096));
        if (!exactObject(value, ["token"]) || typeof value.token !== "string" || !securelyEqual(digest(value.token), bootstrapHash)) {
          throw new RequestError(401, "bootstrap_denied");
        }
        bootstrapHash = undefined;
        const sessionId = capability();
        session = {
          idHash: digest(sessionId),
          csrfToken: capability(),
          expiresAt: now() + sessionTtlMs,
          revoked: false
        };
        response.setHeader("Set-Cookie", `${COOKIE_NAME}=${sessionId}; HttpOnly; SameSite=Strict; Path=/`);
        sendJson(response, 200, { ok: true });
        return;
      }

      const activeSession = requireSession(request, session, now());

      if (request.method === "GET" && path === "/") {
        send(response, 200, options.ui.indexHtml, "text/html; charset=utf-8");
        return;
      }
      if (request.method === "GET" && options.ui.assets[path] !== undefined) {
        const asset = options.ui.assets[path]!;
        sendAsset(response, asset);
        return;
      }
      if (request.method === "GET" && path === "/api/session") {
        sendJson(response, 200, { csrfToken: activeSession.csrfToken, expiresAt: activeSession.expiresAt });
        return;
      }
      if (request.method === "GET" && path === "/api/profile") {
        sendSnapshot(response, await options.store.load());
        return;
      }
      if (request.method === "GET" && path === "/api/profile/export") {
        if (options.localData === undefined) throw new RequestError(404, "not_found");
        sendJson(response, 200, await options.localData.exportData());
        return;
      }
      if (request.method === "POST" && path === "/api/profile/import/preview") {
        if (options.localData === undefined) throw new RequestError(404, "not_found");
        requireMutation(request, origin, activeSession);
        const value = await parseJson(request, maxBodyBytes);
        if (!exactObject(value, ["serialized"]) || typeof value.serialized !== "string") {
          throw new RequestError(400, "invalid_import_request");
        }
        sendJson(response, 200, await options.localData.previewImport(value.serialized));
        return;
      }
      if (request.method === "POST" && path === "/api/profile/import/confirm") {
        if (options.localData === undefined) throw new RequestError(404, "not_found");
        requireMutation(request, origin, activeSession);
        const expectedRevision = await requireExpectedRevision(request, () => options.store.load());
        const value = await parseJson(request, maxBodyBytes);
        if (
          !exactObject(value, ["confirmationToken", "expectedCurrentProfileVersion", "serialized"]) ||
          typeof value.confirmationToken !== "string" ||
          typeof value.expectedCurrentProfileVersion !== "string" ||
          typeof value.serialized !== "string"
        ) throw new RequestError(400, "invalid_import_request");
        if (value.expectedCurrentProfileVersion !== expectedRevision) throw new ProfileHostConflictError();
        const result = await options.localData.confirmImport({
          confirmationToken: value.confirmationToken,
          expectedCurrentProfileVersion: value.expectedCurrentProfileVersion,
          serialized: value.serialized
        });
        response.setHeader("ETag", quotedEtag(result.snapshot.revision));
        sendJson(response, 200, { profile: result.snapshot.profile, rollback: result.rollback });
        return;
      }
      if (request.method === "POST" && path === "/api/profile/import/rollback") {
        if (options.localData === undefined) throw new RequestError(404, "not_found");
        requireMutation(request, origin, activeSession);
        const expectedRevision = await requireExpectedRevision(request, () => options.store.load());
        const value = await parseJson(request, maxBodyBytes);
        if (
          !exactObject(value, ["rollbackToken", "expectedImportedProfileVersion"]) ||
          typeof value.rollbackToken !== "string" ||
          typeof value.expectedImportedProfileVersion !== "string"
        ) throw new RequestError(400, "invalid_import_request");
        if (value.expectedImportedProfileVersion !== expectedRevision) throw new ProfileHostConflictError();
        const result = await options.localData.rollbackImport({
          rollbackToken: value.rollbackToken,
          expectedImportedProfileVersion: value.expectedImportedProfileVersion
        });
        response.setHeader("ETag", quotedEtag(result.snapshot.revision));
        sendJson(response, 200, { profile: result.snapshot.profile });
        return;
      }
      if (request.method === "PUT" && path === "/api/profile") {
        requireMutation(request, origin, activeSession);
        const expectedRevision = await requireExpectedRevision(request, () => options.store.load());
        const value = await parseJson(request, maxBodyBytes);
        if (!exactObject(value, ["profile"])) throw new ProfilePayloadValidationError();
        const profile = validateCurrentProfilePayload(value.profile);
        sendSnapshot(response, await options.store.save({ profile, expectedRevision }));
        return;
      }
      if (request.method === "DELETE" && path === "/api/profile") {
        requireMutation(request, origin, activeSession);
        if (Number(request.headers["content-length"] ?? 0) !== 0 || request.headers["transfer-encoding"] !== undefined) {
          throw new RequestError(400, "unexpected_body");
        }
        const expectedRevision = await requireExpectedRevision(request, () => options.store.load());
        sendSnapshot(response, await options.store.clear({ expectedRevision }));
        return;
      }
      throw new RequestError(404, "not_found");
    } catch (error) {
      if (response.headersSent || response.destroyed) return;
      if (error instanceof ProfileHostConflictError) {
        sendJson(response, 409, { error: "revision_conflict" });
      } else if (error instanceof ProfileServiceError) {
        sendJson(response, profileServiceStatus(error.code), { error: profileServicePublicCode(error.code) });
      } else if (error instanceof ProfilePayloadValidationError) {
        sendJson(response, 422, { error: "invalid_profile" });
      } else if (error instanceof RequestError) {
        sendJson(response, error.status, { error: error.code });
      } else {
        sendJson(response, 500, { error: "internal_error" });
      }
    }
  });
  server.requestTimeout = PROFILE_HOST_LIMITS.requestTimeoutMs;
  server.headersTimeout = PROFILE_HOST_LIMITS.headersTimeoutMs;
  server.keepAliveTimeout = PROFILE_HOST_LIMITS.keepAliveTimeoutMs;

  server.on("connection", (socket) => {
    sockets.add(socket);
    socket.on("close", () => sockets.delete(socket));
  });

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, LOOPBACK_HOST, () => {
      server.off("error", reject);
      resolve();
    });
  });
  const address = server.address();
  if (address === null || typeof address === "string") {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    throw new Error("Profile host failed to bind to an IPv4 loopback port.");
  }
  expectedHost = `${LOOPBACK_HOST}:${address.port}`;
  origin = `http://${expectedHost}`;

  return {
    port: address.port,
    origin,
    bootstrapUrl: `${origin}/bootstrap#${bootstrapToken}`,
    get listening() {
      return !stopped && server.listening;
    },
    revoke() {
      bootstrapHash = undefined;
      if (session !== undefined) session.revoked = true;
    },
    async stop() {
      if (stopped) return;
      stopped = true;
      bootstrapHash = undefined;
      if (session !== undefined) session.revoked = true;
      await new Promise<void>((resolve, reject) => {
        server.close((error) => (error === undefined ? resolve() : reject(error)));
        server.closeAllConnections?.();
        for (const socket of sockets) socket.destroy();
      });
    }
  };
}

function profileServiceStatus(code: string): number {
  if (code === "conflict") return 409;
  if (code.includes("required")) return 428;
  if (code.startsWith("expired_")) return 410;
  if (code.startsWith("invalid_") || code === "unknown_profile_path" || code === "non_scalar_profile_path") return 422;
  if (code === "repository_busy") return 423;
  return 500;
}

function profileServicePublicCode(code: string): string {
  if (code === "conflict") return "revision_conflict";
  if (code.includes("import") || code === "invalid_export") return "profile_import_rejected";
  return "profile_service_unavailable";
}

function requireSession(request: IncomingMessage, session: ActiveSession | undefined, now: number): ActiveSession {
  const sessionId = cookies(request)[COOKIE_NAME];
  if (
    session === undefined ||
    session.revoked ||
    now >= session.expiresAt ||
    sessionId === undefined ||
    !securelyEqual(digest(sessionId), session.idHash)
  ) {
    throw new RequestError(401, "unauthorized");
  }
  return session;
}

function requireOrigin(request: IncomingMessage, origin: string): void {
  if (request.headers.origin !== origin) throw new RequestError(403, "origin_denied");
}

function requireMutation(request: IncomingMessage, origin: string, session: ActiveSession): void {
  requireOrigin(request, origin);
  const token = request.headers["x-profile-csrf"];
  if (typeof token !== "string" || !securelyEqual(digest(token), digest(session.csrfToken))) {
    throw new RequestError(403, "csrf_denied");
  }
}

async function requireExpectedRevision(
  request: IncomingMessage,
  load: ProfileHostOptions["store"]["load"]
): Promise<string> {
  const value = request.headers["if-match"];
  if (typeof value !== "string" || !/^"[A-Za-z0-9_-]{43}"$/.test(value)) {
    throw new RequestError(428, "revision_required");
  }
  const current = await load();
  if (quotedEtag(current.revision) !== value) throw new ProfileHostConflictError();
  return current.revision;
}

function standardCsp(): string {
  return "default-src 'none'; script-src 'self'; style-src 'self'; font-src 'self'; img-src 'self' data:; connect-src 'self'; worker-src 'self'; object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'";
}

function bootstrapCsp(nonce: string): string {
  return `default-src 'none'; script-src 'nonce-${nonce}'; connect-src 'self'; object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'`;
}

function applyBaseHeaders(response: ServerResponse, csp: string): void {
  response.setHeader("Cache-Control", "no-store, max-age=0");
  response.setHeader("Pragma", "no-cache");
  response.setHeader("Content-Security-Policy", csp);
  response.setHeader("X-Content-Type-Options", "nosniff");
  response.setHeader("X-Frame-Options", "DENY");
  response.setHeader("Referrer-Policy", "no-referrer");
  response.setHeader("Cross-Origin-Resource-Policy", "same-origin");
}

function send(response: ServerResponse, status: number, body: Uint8Array | string, contentType: string): void {
  response.statusCode = status;
  response.setHeader("Content-Type", contentType);
  response.end(body);
}

function sendJson(response: ServerResponse, status: number, value: unknown): void {
  send(response, status, jsonBody(value), "application/json; charset=utf-8");
}

function sendSnapshot(response: ServerResponse, snapshot: ProfileHostSnapshot): void {
  response.setHeader("ETag", quotedEtag(snapshot.revision));
  sendJson(response, 200, { profile: snapshot.profile });
}

function sendAsset(response: ServerResponse, asset: ProfileHostUiAsset): void {
  send(response, 200, asset.body, asset.contentType);
}
