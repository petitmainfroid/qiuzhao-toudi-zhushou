import { mkdir, realpath } from "node:fs/promises";
import path from "node:path";
import type { BrowserKind } from "./types.js";

export function defaultUserDataDirs(env: NodeJS.ProcessEnv = process.env): string[] {
  const local = env.LOCALAPPDATA;
  if (!local) return [];
  return [
    path.join(local, "Google", "Chrome", "User Data"),
    path.join(local, "Microsoft", "Edge", "User Data")
  ];
}

export function defaultRuntimeRoot(env: NodeJS.ProcessEnv = process.env): string {
  const local = env.LOCALAPPDATA ?? env.TEMP ?? process.cwd();
  return path.join(local, "QiuzhaoRecruitmentAgent", "browser-runtime");
}

export function defaultProfileDir(
  kind: BrowserKind,
  env: NodeJS.ProcessEnv = process.env
): string {
  return path.join(defaultRuntimeRoot(env), "profiles", `${kind}-recruitment`);
}

export function defaultSessionFile(env: NodeJS.ProcessEnv = process.env): string {
  return path.join(defaultRuntimeRoot(env), "session.json");
}

function comparable(input: string): string {
  const normalized = path.resolve(input).replace(/[\\/]+$/, "");
  return process.platform === "win32" ? normalized.toLowerCase() : normalized;
}

function isWithin(candidate: string, parent: string): boolean {
  return candidate === parent || candidate.startsWith(`${parent}${path.sep}`);
}

export async function assertDedicatedProfileDir(
  profileDir: string,
  defaults = defaultUserDataDirs()
): Promise<string> {
  if (!path.isAbsolute(profileDir)) {
    throw new Error("profile_dir_must_be_absolute");
  }

  await mkdir(profileDir, { recursive: true, mode: 0o700 });
  const canonical = await realpath(profileDir);
  const resolved = comparable(canonical);

  for (const defaultDir of defaults) {
    let defaultCanonical = defaultDir;
    try {
      defaultCanonical = await realpath(defaultDir);
    } catch {
      // A browser that is not installed may have no default data directory yet.
    }
    const defaultResolved = comparable(defaultCanonical);
    if (isWithin(resolved, defaultResolved) || isWithin(defaultResolved, resolved)) {
      throw new Error("default_profile_forbidden");
    }
  }

  return canonical;
}

export function normalizePageIdentity(input: string): { safeUrl: string; origin: string; pathPattern: string } {
  const url = new URL(input);
  if (url.protocol !== "https:" || url.username || url.password) {
    throw new Error("https_url_without_credentials_required");
  }

  url.search = "";
  url.hash = "";
  const pathPattern = url.pathname
    .split("/")
    .map((segment) =>
      /^\d{6,}$/.test(segment) || /^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(segment)
        ? ":id"
        : segment
    )
    .join("/");

  return { safeUrl: url.toString(), origin: url.origin, pathPattern };
}
