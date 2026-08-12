import http from "node:http";
import type { BrowserRuntimeStatus, RuntimeSessionRecord } from "./types.js";

export async function callControl(
  session: RuntimeSessionRecord,
  method: "GET" | "POST",
  pathname: "/v1/status" | "/v1/stop"
): Promise<BrowserRuntimeStatus> {
  return await new Promise<BrowserRuntimeStatus>((resolve, reject) => {
    const request = http.request(
      {
        host: "127.0.0.1",
        port: session.status.controlPort,
        method,
        path: pathname,
        timeout: 2_000,
        headers: { authorization: `Bearer ${session.capability}` }
      },
      (response) => {
        const chunks: Buffer[] = [];
        response.on("data", (chunk: Buffer) => chunks.push(chunk));
        response.on("end", () => {
          const body = Buffer.concat(chunks).toString("utf8");
          if (response.statusCode !== 200) {
            reject(new Error(`control_http_${response.statusCode ?? "unknown"}`));
            return;
          }
          try {
            resolve(JSON.parse(body) as BrowserRuntimeStatus);
          } catch {
            reject(new Error("control_invalid_json"));
          }
        });
      }
    );
    request.once("timeout", () => request.destroy(new Error("control_timeout")));
    request.once("error", reject);
    request.end();
  });
}
