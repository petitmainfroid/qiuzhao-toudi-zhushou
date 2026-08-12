export const RUNTIME_STATES = [
  "starting",
  "ready",
  "login-needed",
  "disconnected",
  "stopped"
] as const;

export type RuntimeState = (typeof RUNTIME_STATES)[number];
export type BrowserKind = "chrome" | "edge";

export interface BrowserInstallation {
  kind: BrowserKind;
  executablePath: string;
  source: "program-files" | "local-app-data" | "registry" | "explicit";
  commandPrefix?: readonly string[];
}

export interface PageIdentity {
  origin: string;
  pathPattern: string;
}

export interface BrowserRuntimeStatus {
  launchId: string;
  state: RuntimeState;
  browser: BrowserKind;
  browserVersion?: string;
  browserPid?: number;
  profileDir: string;
  cdpPort?: number;
  controlPort: number;
  startedAt: string;
  page?: PageIdentity;
  errorCode?: string;
}

export interface RuntimeSessionRecord {
  schemaVersion: 1;
  capability: string;
  executablePath: string;
  commandPrefix?: readonly string[];
  status: BrowserRuntimeStatus;
}

export interface LaunchOptions {
  browser: BrowserInstallation;
  profileDir: string;
  sessionFile: string;
  targetUrl?: string;
  startupTimeoutMs?: number;
  pollIntervalMs?: number;
}

export interface AdoptOptions extends LaunchOptions {
  browserPid: number;
  cdpPort: number;
}
