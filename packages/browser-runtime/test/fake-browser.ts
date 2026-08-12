import http from "node:http";
import { mkdir, writeFile } from "node:fs/promises";

const profileArg = process.argv.find((arg) => arg.startsWith("--user-data-dir="));
if (!profileArg) throw new Error("missing_user_data_dir");
const profileDir = profileArg.slice("--user-data-dir=".length);
const pageUrl = process.argv.find((arg) => arg.startsWith("https://")) ?? "about:blank";

const server = http.createServer((request, response) => {
  response.setHeader("content-type", "application/json");
  if (request.url === "/json/version") {
    response.end(JSON.stringify({ Browser: "FakeChromium/136.0.1.2", "Protocol-Version": "1.3" }));
    return;
  }
  if (request.url === "/json/list") {
    response.end(JSON.stringify([{ id: "blank", type: "page", url: pageUrl }]));
    return;
  }
  response.statusCode = 404;
  response.end("{}");
});

server.listen({ host: "127.0.0.1", port: 0 }, async () => {
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("missing_address");
  await mkdir(profileDir, { recursive: true });
  await writeFile(`${profileDir}/DevToolsActivePort`, `${address.port}\n/devtools/browser/fake\n`);
});

function stop(): void {
  server.close(() => process.exit(0));
}
process.on("SIGTERM", stop);
process.on("SIGINT", stop);
