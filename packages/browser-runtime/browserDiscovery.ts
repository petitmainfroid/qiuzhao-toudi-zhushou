import { access } from "node:fs/promises";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { BrowserInstallation, BrowserKind } from "./types.js";

const execFileAsync = promisify(execFile);

interface Candidate {
  kind: BrowserKind;
  executablePath: string;
  source: BrowserInstallation["source"];
}

function commonCandidates(env: NodeJS.ProcessEnv): Candidate[] {
  const roots = [
    [env.ProgramFiles, "program-files"],
    [env["ProgramFiles(x86)"], "program-files"],
    [env.LOCALAPPDATA, "local-app-data"]
  ] as const;
  const candidates: Candidate[] = [];

  for (const [root, source] of roots) {
    if (!root) continue;
    candidates.push({
      kind: "chrome",
      executablePath: path.join(root, "Google", "Chrome", "Application", "chrome.exe"),
      source
    });
    candidates.push({
      kind: "edge",
      executablePath: path.join(root, "Microsoft", "Edge", "Application", "msedge.exe"),
      source
    });
  }
  return candidates;
}

async function registryCandidates(): Promise<Candidate[]> {
  if (process.platform !== "win32") return [];
  const apps: Array<[BrowserKind, string]> = [
    ["chrome", "chrome.exe"],
    ["edge", "msedge.exe"]
  ];
  const candidates: Candidate[] = [];

  for (const [kind, app] of apps) {
    for (const key of [
      `HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\App Paths\\${app}`,
      `HKLM\\Software\\Microsoft\\Windows\\CurrentVersion\\App Paths\\${app}`
    ]) {
      try {
        const { stdout } = await execFileAsync("reg.exe", ["query", key, "/ve"], {
          windowsHide: true,
          timeout: 2_000
        });
        const match = stdout.match(/REG_SZ\s+(.+?)\s*$/m);
        if (match?.[1]) {
          candidates.push({ kind, executablePath: match[1].trim(), source: "registry" });
        }
      } catch {
        // A missing key is expected on machines with only one Chromium browser.
      }
    }
  }
  return candidates;
}

export async function discoverInstalledBrowsers(
  env: NodeJS.ProcessEnv = process.env
): Promise<BrowserInstallation[]> {
  const seen = new Set<string>();
  const found: BrowserInstallation[] = [];
  for (const candidate of [...commonCandidates(env), ...(await registryCandidates())]) {
    const key = candidate.executablePath.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    try {
      await access(candidate.executablePath);
      found.push(candidate);
    } catch {
      // Continue discovery without treating an absent standard path as an error.
    }
  }
  return found;
}

export async function selectInstalledBrowser(
  preferred?: BrowserKind,
  env: NodeJS.ProcessEnv = process.env
): Promise<BrowserInstallation> {
  const browsers = await discoverInstalledBrowsers(env);
  const selected = preferred
    ? browsers.find((browser) => browser.kind === preferred)
    : browsers.find((browser) => browser.kind === "chrome") ?? browsers[0];
  if (!selected) throw new Error(preferred ? `${preferred}_not_found` : "chrome_or_edge_not_found");
  return selected;
}
