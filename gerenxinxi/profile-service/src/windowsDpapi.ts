import { spawn } from "node:child_process";
import { accessSync } from "node:fs";
import { isAbsolute, normalize, resolve } from "node:path";
import type { AtRestProtector } from "./types";
import { ProfileServiceError } from "./errors";

const DEFAULT_MAX_BYTES = 4 * 1024 * 1024;
const DEFAULT_TIMEOUT_MS = 15_000;

const POWERSHELL_SCRIPT = String.raw`
$ErrorActionPreference = 'Stop'
try {
  Add-Type -AssemblyName System.Security
  $requestText = [Console]::In.ReadToEnd()
  if ($requestText.Length -gt 12000000) { exit 40 }
  $request = $requestText | ConvertFrom-Json
  if ($null -eq $request -or ($request.op -ne 'protect' -and $request.op -ne 'unprotect') -or $request.data -isnot [string]) { exit 41 }
  $inputBytes = [Convert]::FromBase64String($request.data)
  if ($request.op -eq 'protect') {
    if ($inputBytes.Length -gt 4194304) { exit 42 }
    $outputBytes = [System.Security.Cryptography.ProtectedData]::Protect(
      $inputBytes, $null, [System.Security.Cryptography.DataProtectionScope]::CurrentUser
    )
  } else {
    if ($inputBytes.Length -gt 8388608) { exit 42 }
    $outputBytes = [System.Security.Cryptography.ProtectedData]::Unprotect(
      $inputBytes, $null, [System.Security.Cryptography.DataProtectionScope]::CurrentUser
    )
  }
  [Console]::Out.Write([Convert]::ToBase64String($outputBytes))
} catch {
  exit 43
}
`;

const ENCODED_COMMAND = Buffer.from(POWERSHELL_SCRIPT, "utf16le").toString("base64");

export interface DpapiProcessRequest {
  executable: string;
  args: readonly string[];
  stdin: string;
  timeoutMs: number;
  maxOutputBytes: number;
}

export type DpapiProcessRunner = (request: Readonly<DpapiProcessRequest>) => Promise<string>;

export interface WindowsDpapiProtectorOptions {
  powershellExecutable?: string;
  timeoutMs?: number;
  maxPlaintextBytes?: number;
  maxCiphertextBytes?: number;
  platform?: NodeJS.Platform;
  processRunner?: DpapiProcessRunner;
}

function fail(): never {
  throw new ProfileServiceError("protection_failed", "Windows user-bound profile protection failed");
}

function decodeStrictBase64(value: string, maxBytes: number): Buffer {
  if (value.length === 0 || value.length > Math.ceil(maxBytes / 3) * 4 + 8
    || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value)) fail();
  const decoded = Buffer.from(value, "base64");
  if (decoded.length > maxBytes || decoded.toString("base64") !== value) fail();
  return decoded;
}

export const runDpapiPowerShell: DpapiProcessRunner = (request) => new Promise((resolve, reject) => {
  const child = spawn(request.executable, [...request.args], {
    shell: false,
    windowsHide: true,
    stdio: ["pipe", "pipe", "pipe"]
  });
  const stdout: Buffer[] = [];
  let stdoutBytes = 0;
  let settled = false;
  const finish = (error?: Error, output?: string) => {
    if (settled) return;
    settled = true;
    clearTimeout(timer);
    if (error) reject(error);
    else resolve(output ?? "");
  };
  const timer = setTimeout(() => {
    child.kill();
    finish(new Error("dpapi-timeout"));
  }, request.timeoutMs);
  child.once("error", () => finish(new Error("dpapi-process-failed")));
  child.stdout.on("data", (chunk: Buffer) => {
    stdoutBytes += chunk.length;
    if (stdoutBytes > request.maxOutputBytes) {
      child.kill();
      finish(new Error("dpapi-output-too-large"));
      return;
    }
    stdout.push(chunk);
  });
  // stderr is intentionally drained and discarded; it is never surfaced or logged.
  child.stderr.resume();
  child.once("close", (code) => {
    if (code !== 0) finish(new Error("dpapi-process-failed"));
    else finish(undefined, Buffer.concat(stdout).toString("ascii"));
  });
  child.stdin.once("error", () => finish(new Error("dpapi-stdin-failed")));
  child.stdin.end(request.stdin, "utf8");
});

export class WindowsDpapiProtector implements AtRestProtector {
  readonly providerId = "windows-dpapi-current-user-v1";
  private readonly executable: string;
  private readonly timeoutMs: number;
  private readonly maxPlaintextBytes: number;
  private readonly maxCiphertextBytes: number;
  private readonly runner: DpapiProcessRunner;

  constructor(options: WindowsDpapiProtectorOptions = {}) {
    if ((options.platform ?? process.platform) !== "win32") {
      throw new ProfileServiceError("protection_failed", "Windows DPAPI is unavailable on this platform");
    }
    const systemRoot = process.env.SystemRoot;
    const defaultExecutable = systemRoot
      ? resolve(systemRoot, "System32", "WindowsPowerShell", "v1.0", "powershell.exe")
      : "";
    this.executable = options.powershellExecutable ?? defaultExecutable;
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.maxPlaintextBytes = options.maxPlaintextBytes ?? DEFAULT_MAX_BYTES;
    this.maxCiphertextBytes = options.maxCiphertextBytes ?? DEFAULT_MAX_BYTES * 2;
    this.runner = options.processRunner ?? runDpapiPowerShell;
    if (!Number.isSafeInteger(this.timeoutMs) || this.timeoutMs < 100 || this.timeoutMs > 60_000
      || !Number.isSafeInteger(this.maxPlaintextBytes) || this.maxPlaintextBytes < 1 || this.maxPlaintextBytes > DEFAULT_MAX_BYTES
      || !Number.isSafeInteger(this.maxCiphertextBytes) || this.maxCiphertextBytes < 1 || this.maxCiphertextBytes > DEFAULT_MAX_BYTES * 2) fail();
    if (!options.processRunner) {
      const trustedRoot = systemRoot ? normalize(resolve(systemRoot, "System32")) : "";
      const normalizedExecutable = normalize(this.executable);
      if (!trustedRoot || !isAbsolute(normalizedExecutable)
        || !normalizedExecutable.toLowerCase().startsWith(`${trustedRoot.toLowerCase()}\\`)) fail();
      try { accessSync(normalizedExecutable); } catch { fail(); }
    }
  }

  async protect(plaintext: string): Promise<string> {
    return this.invoke("protect", Buffer.from(plaintext, "utf8"));
  }

  async unprotect(protectedPayload: string): Promise<string> {
    const bytes = decodeStrictBase64(protectedPayload, this.maxCiphertextBytes);
    const plaintextBase64 = await this.invoke("unprotect", bytes);
    return decodeStrictBase64(plaintextBase64, this.maxPlaintextBytes).toString("utf8");
  }

  private async invoke(operation: "protect" | "unprotect", bytes: Buffer): Promise<string> {
    const inputLimit = operation === "protect" ? this.maxPlaintextBytes : this.maxCiphertextBytes;
    const outputLimit = operation === "protect" ? this.maxCiphertextBytes : this.maxPlaintextBytes;
    if (bytes.length > inputLimit) fail();
    const stdin = JSON.stringify({ op: operation, data: bytes.toString("base64") });
    try {
      const output = await this.runner({
        executable: this.executable,
        args: ["-NoLogo", "-NoProfile", "-NonInteractive", "-EncodedCommand", ENCODED_COMMAND],
        stdin,
        timeoutMs: this.timeoutMs,
        maxOutputBytes: Math.ceil(outputLimit * 4 / 3) + 8
      });
      const result = decodeStrictBase64(output, outputLimit);
      return operation === "protect" ? result.toString("base64") : output;
    } catch {
      fail();
    }
  }
}
