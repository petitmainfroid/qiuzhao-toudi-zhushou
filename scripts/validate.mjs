import { spawnSync } from "node:child_process";

if (!process.env.npm_execpath) {
  throw new Error("npm_execpath is unavailable. Run validation through `npm run validate`.");
}

const checks = [
  ["run", "typecheck"],
  ["test", "--", "--run"],
  ["run", "verify:corpus"],
  ["run", "build"],
  ["run", "verify:dist"]
];

for (const args of checks) {
  const result = spawnSync(process.execPath, [process.env.npm_execpath, ...args], {
    stdio: "inherit"
  });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}
