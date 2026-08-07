import { access, readFile, readdir } from "node:fs/promises";
import { resolve } from "node:path";

const projectRoot = resolve(import.meta.dirname, "..");
const collectorRoot = resolve(projectRoot, "dist-collector");
const requiredFiles = ["manifest.json", "sidepanel.html", "background.js", "content.js"];
const expectedPermissions = [
  "activeTab",
  "alarms",
  "debugger",
  "scripting",
  "sidePanel",
  "storage",
  "tabs",
  "webNavigation"
];

async function textFiles(directory) {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const target = resolve(directory, entry.name);
    if (entry.isDirectory()) files.push(...await textFiles(target));
    else if (/\.(?:html|js|json)$/i.test(entry.name)) files.push(target);
  }
  return files;
}

for (const file of requiredFiles) await access(resolve(collectorRoot, file));

const manifest = JSON.parse(await readFile(resolve(collectorRoot, "manifest.json"), "utf8"));
const actualPermissions = [...manifest.permissions].sort();
if (JSON.stringify(actualPermissions) !== JSON.stringify(expectedPermissions)) {
  throw new Error(`Unexpected collector-build permissions: ${actualPermissions.join(", ")}`);
}
if (JSON.stringify(manifest.host_permissions) !== JSON.stringify(["<all_urls>"])) {
  throw new Error(`Unexpected collector-build host permissions: ${JSON.stringify(manifest.host_permissions)}`);
}
for (const forbidden of ["cookies", "downloads", "nativeMessaging", "tabGroups", "webRequest", "webRequestBlocking"]) {
  if (actualPermissions.includes(forbidden)) throw new Error(`Forbidden collector-build permission: ${forbidden}`);
}

const builtText = (await Promise.all(
  (await textFiles(collectorRoot)).map((file) => readFile(file, "utf8"))
)).join("\n");
for (const marker of ["QIUZHAO_ATS_COLLECTOR_DEV_ONLY_V1", "ATS 匿名结构采集器", "下载匿名 JSON"]) {
  if (!builtText.includes(marker)) throw new Error(`Collector build marker is missing: ${marker}`);
}
console.log("Verified development-only ATS collector build and exact unchanged permissions.");
