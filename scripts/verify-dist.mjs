import { access, readFile } from "node:fs/promises";
import { resolve } from "node:path";

const projectRoot = resolve(import.meta.dirname, "..");
const requiredFiles = [
  "manifest.json",
  "options.html",
  "sidepanel.html",
  "background.js",
  "noise.svg",
  "THIRD_PARTY_NOTICES.md",
  "third_party/opencli/LICENSE",
  "ocr/worker.min.js",
  "ocr/tesseract-core-lstm.wasm.js",
  "ocr/chi_sim.traineddata.gz",
  "pdfjs/cmaps/Adobe-CNS1-UCS2.bcmap",
  "pdfjs/standard_fonts/LiberationSans-Regular.ttf"
];

for (const file of requiredFiles) {
  await access(resolve(projectRoot, "dist", file));
}

const manifest = JSON.parse(
  await readFile(resolve(projectRoot, "dist/manifest.json"), "utf8")
);

const expectedPermissions = [
  "activeTab",
  "alarms",
  "debugger",
  "sidePanel",
  "storage",
  "tabs",
  "webNavigation"
];
const actualPermissions = [...manifest.permissions].sort();
if (JSON.stringify(actualPermissions) !== JSON.stringify(expectedPermissions)) {
  throw new Error(`Unexpected manifest permissions: ${actualPermissions.join(", ")}`);
}

if (JSON.stringify(manifest.host_permissions) !== JSON.stringify(["<all_urls>"])) {
  throw new Error(`Unexpected host permissions: ${JSON.stringify(manifest.host_permissions)}`);
}
if (manifest.optional_host_permissions) {
  throw new Error("The embedded kernel must not declare unreviewed optional host permissions.");
}
for (const forbidden of ["cookies", "downloads", "nativeMessaging", "tabGroups", "webRequest", "webRequestBlocking"]) {
  if (actualPermissions.includes(forbidden)) throw new Error(`Forbidden permission: ${forbidden}`);
}

if (manifest.background?.service_worker !== "background.js") {
  throw new Error("Manifest background service worker is not wired to background.js.");
}

try {
  await access(resolve(projectRoot, "dist/content.js"));
  throw new Error("Legacy content.js must not be present in the distribution.");
}
catch (error) {
  if (error instanceof Error && error.message === "Legacy content.js must not be present in the distribution.") {
    throw error;
  }
  if (!error || typeof error !== "object" || error.code !== "ENOENT") throw error;
}

console.log(`Verified ${requiredFiles.length} required distribution files.`);
console.log(`Verified exact browser-kernel permissions: ${actualPermissions.join(", ")}.`);
console.log("Verified host permission <all_urls> and forbidden permission absence.");
console.log("Verified legacy content.js is absent.");
