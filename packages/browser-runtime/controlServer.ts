import { timingSafeEqual } from "node:crypto";
import http from "node:http";
import type { BrowserRuntimeStatus } from "./types.js";

export interface ControlHandlers {
  getStatus(): BrowserRuntimeStatus | Promise<BrowserRuntimeStatus>;
  stop(): Promise<BrowserRuntimeStatus>;
}

function authorized(header: string | undefined, capability: string): boolean {
  if (!header?.startsWith("Bearer ")) return false;
  const supplied = Buffer.from(header.slice(7));
  const expected = Buffer.from(capability);
  return supplied.length === expected.length && timingSafeEqual(supplied, expected);
}

export class CapabilityControlServer {
  private server?: http.Server;
  private port?: number;

  constructor(
    private readonly capability: string,
    private readonly handlers: ControlHandlers
  ) {}

  async start(): Promise<number> {
    if (this.server) throw new Error("control_server_already_started");
    this.server = http.createServer((request, response) => {
      response.setHeader("content-type", "application/json; charset=utf-8");
      response.setHeader("cache-control", "no-store");
      if (!authorized(request.headers.authorization, this.capability)) {
        response.statusCode = 401;
        response.end('{"error":"unauthorized"}\n');
        return;
      }

      if (request.method === "GET" && request.url === "/v1/status") {
        void Promise.resolve(this.handlers.getStatus()).then(
          (status) => {
            response.statusCode = 200;
            response.end(`${JSON.stringify(status)}\n`);
          },
          () => {
            response.statusCode = 500;
            response.end('{"error":"status_failed"}\n');
          }
        );
        return;
      }

      if (request.method === "POST" && request.url === "/v1/stop") {
        void this.handlers.stop().then(
          (status) => {
            response.statusCode = 200;
            response.end(`${JSON.stringify(status)}\n`);
          },
          () => {
            response.statusCode = 500;
            response.end('{"error":"stop_failed"}\n');
          }
        );
        return;
      }

      response.statusCode = 404;
      response.end('{"error":"not_found"}\n');
    });

    await new Promise<void>((resolve, reject) => {
      this.server!.once("error", reject);
      this.server!.listen({ host: "127.0.0.1", port: 0, exclusive: true }, resolve);
    });
    const address = this.server.address();
    if (!address || typeof address === "string" || address.address !== "127.0.0.1") {
      await this.close();
      throw new Error("control_server_not_loopback");
    }
    this.port = address.port;
    return this.port;
  }

  async close(): Promise<void> {
    const server = this.server;
    this.server = undefined;
    this.port = undefined;
    if (!server) return;
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve()))
    );
  }
}
