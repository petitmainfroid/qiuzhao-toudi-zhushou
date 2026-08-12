import http from "node:http";

export interface CdpVersionInfo {
  browser: string;
  protocolVersion?: string;
}

async function readLoopbackJson<T>(port: number, pathname: string, timeoutMs = 1_000): Promise<T> {
  return await new Promise<T>((resolve, reject) => {
    const request = http.get(
      { host: "127.0.0.1", port, path: pathname, timeout: timeoutMs },
      (response) => {
        const chunks: Buffer[] = [];
        response.on("data", (chunk: Buffer) => chunks.push(chunk));
        response.on("end", () => {
          if (response.statusCode !== 200) {
            reject(new Error(`cdp_http_${response.statusCode ?? "unknown"}`));
            return;
          }
          try {
            resolve(JSON.parse(Buffer.concat(chunks).toString("utf8")) as T);
          } catch {
            reject(new Error("cdp_invalid_json"));
          }
        });
      }
    );
    request.once("timeout", () => request.destroy(new Error("cdp_timeout")));
    request.once("error", reject);
  });
}

export async function probeCdp(port: number): Promise<CdpVersionInfo> {
  const result = await readLoopbackJson<{ Browser?: string; "Protocol-Version"?: string }>(
    port,
    "/json/version"
  );
  if (!result.Browser) throw new Error("cdp_browser_missing");
  return { browser: result.Browser, protocolVersion: result["Protocol-Version"] };
}

export async function hasInspectablePage(port: number): Promise<boolean> {
  return (await listInspectablePageUrls(port)).length > 0;
}

export async function listInspectablePageUrls(port: number): Promise<string[]> {
  const targets = await readLoopbackJson<Array<{ type?: string; url?: string }>>(port, "/json/list");
  return targets
    .filter((target) => target.type === "page" && typeof target.url === "string")
    .map((target) => target.url!);
}
