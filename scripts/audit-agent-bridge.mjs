import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { request } from "node:http";
import { homedir, platform } from "node:os";
import { join, resolve } from "node:path";

const projectRoot = resolve(import.meta.dirname, "..");
const openCliExtensionId = "ildkmabpimmkaediidaifkhjpohdnifk";
const requiredPermissions = ["activeTab", "scripting", "sidePanel", "storage"];
const forbiddenPermissions = [
  "cookies",
  "debugger",
  "downloads",
  "nativeMessaging",
  "webRequest",
  "webRequestBlocking"
];

function argument(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function commandProbe(command, args = []) {
  const lookup = spawnSync(platform() === "win32" ? "where.exe" : "which", [command], {
    encoding: "utf8",
    windowsHide: true
  });
  if (lookup.status !== 0) return { present: false, version: null };

  const resolved = lookup.stdout.split(/\r?\n/).map((value) => value.trim()).filter(Boolean);
  const windowsCommand = resolved.find((value) => value.toLowerCase().endsWith(".cmd"));
  const powershellWrapper = windowsCommand?.replace(/\.cmd$/i, ".ps1");
  const probe = platform() === "win32" && windowsCommand
    ? spawnSync("powershell.exe", [
        "-NoProfile",
        "-ExecutionPolicy",
        "Bypass",
        "-File",
        existsSync(powershellWrapper) ? powershellWrapper : windowsCommand,
        ...args
      ], {
        encoding: "utf8",
        timeout: 5_000,
        windowsHide: true
      })
    : spawnSync(resolved[0] ?? command, args, {
        encoding: "utf8",
        timeout: 5_000,
        windowsHide: true
      });
  return {
    present: probe.status === 0,
    version: probe.status === 0 ? `${probe.stdout}${probe.stderr}`.trim() : null
  };
}

function browserProfileRoots() {
  if (platform() === "win32" && process.env.LOCALAPPDATA) {
    return [
      join(process.env.LOCALAPPDATA, "Google", "Chrome", "User Data"),
      join(process.env.LOCALAPPDATA, "Microsoft", "Edge", "User Data")
    ];
  }
  if (platform() === "darwin") {
    return [
      join(homedir(), "Library", "Application Support", "Google", "Chrome"),
      join(homedir(), "Library", "Application Support", "Microsoft Edge")
    ];
  }
  return [
    join(homedir(), ".config", "google-chrome"),
    join(homedir(), ".config", "chromium"),
    join(homedir(), ".config", "microsoft-edge")
  ];
}

function countOpenCliExtensionCopies() {
  let count = 0;
  for (const root of browserProfileRoots()) {
    if (!existsSync(root)) continue;
    for (const entry of readdirSync(root, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      if (existsSync(join(root, entry.name, "Extensions", openCliExtensionId))) count += 1;
    }
  }
  return count;
}

function readDaemonStatus() {
  return new Promise((resolveStatus) => {
    const req = request({
      hostname: "127.0.0.1",
      port: 19825,
      path: "/status",
      method: "GET",
      headers: { "X-OpenCLI": "1" },
      timeout: 1_500
    }, (response) => {
      let raw = "";
      response.setEncoding("utf8");
      response.on("data", (chunk) => {
        if (raw.length < 65_536) raw += chunk;
      });
      response.on("end", () => {
        try {
          const payload = JSON.parse(raw);
          resolveStatus({
            responding: response.statusCode === 200 && payload?.ok === true,
            extensionConnected: payload?.extensionConnected === true
          });
        }
        catch {
          resolveStatus({ responding: false, extensionConnected: false });
        }
      });
    });
    req.on("timeout", () => req.destroy());
    req.on("error", () => resolveStatus({ responding: false, extensionConnected: false }));
    req.end();
  });
}

function inspectManifest() {
  const manifest = JSON.parse(readFileSync(join(projectRoot, "public", "manifest.json"), "utf8"));
  const permissions = [...(manifest.permissions ?? [])].sort();
  const forbidden = permissions.filter((permission) => forbiddenPermissions.includes(permission));
  const requiredUnchanged = JSON.stringify(permissions) === JSON.stringify(requiredPermissions);
  const persistentHosts = [...(manifest.host_permissions ?? [])];
  return {
    requiredUnchanged,
    permissions,
    forbidden,
    persistentHosts,
    optionalHosts: [...(manifest.optional_host_permissions ?? [])]
  };
}

function inspectTargetUrl(rawUrl) {
  if (!rawUrl) return { provided: false, eligible: false, normalized: null, reason: "not-provided" };
  try {
    const actual = new URL(rawUrl);
    const fixture = JSON.parse(
      readFileSync(join(projectRoot, "tests", "fixtures", "xiaomi-internship-schema.json"), "utf8")
    );
    const expected = new URL(fixture.sourceUrl);
    actual.hash = "";
    const eligible =
      actual.protocol === "https:" &&
      actual.origin === expected.origin &&
      actual.pathname === expected.pathname &&
      !actual.username &&
      !actual.password;
    return {
      provided: true,
      eligible,
      normalized: actual.href,
      reason: eligible ? "xiaomi-application-url" : "origin-or-path-mismatch"
    };
  }
  catch {
    return { provided: true, eligible: false, normalized: null, reason: "invalid-url" };
  }
}

const targetUrl = argument("--url") ?? process.env.AGENT_BRIDGE_TARGET_URL;
const requireReady = process.argv.includes("--require-ready");
const opencli = commandProbe("opencli", ["--version"]);
const agentReach = commandProbe("agent-reach", ["--version"]);
const daemon = await readDaemonStatus();
const manifest = inspectManifest();
const target = inspectTargetUrl(targetUrl);
const extensionCopies = countOpenCliExtensionCopies();

const blockers = [];
if (!opencli.present) blockers.push("opencli-missing");
if (extensionCopies === 0) blockers.push("opencli-browser-bridge-not-installed");
if (!daemon.responding) blockers.push("opencli-daemon-not-running");
if (!daemon.extensionConnected) blockers.push("opencli-extension-not-connected");
if (!target.provided) blockers.push("target-url-not-provided");
else if (!target.eligible) blockers.push("target-url-not-eligible");
if (!manifest.requiredUnchanged || manifest.forbidden.length > 0 || manifest.persistentHosts.length > 0) {
  blockers.push("extension-permission-boundary-changed");
}

const report = {
  schemaVersion: 1,
  status: blockers.length === 0 ? "ready" : "blocked",
  opencli,
  agentReach,
  browserBridge: {
    extensionId: openCliExtensionId,
    installedProfileCopies: extensionCopies,
    daemonResponding: daemon.responding,
    extensionConnected: daemon.extensionConnected
  },
  target,
  extensionManifest: manifest,
  safety: {
    daemonAutoStartAttempted: false,
    browserProfileMutationAttempted: false,
    cookieReadAttempted: false,
    pageValueReadAttempted: false,
    applicationSubmissionAttempted: false
  },
  blockers
};

console.log(JSON.stringify(report, null, 2));

const unsafeManifest = blockers.includes("extension-permission-boundary-changed");
if (unsafeManifest || (target.provided && !target.eligible) || (requireReady && blockers.length > 0)) {
  process.exitCode = 1;
}
