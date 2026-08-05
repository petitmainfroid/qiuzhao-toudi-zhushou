import { access, readFile } from "node:fs/promises";
import { resolve } from "node:path";

const projectRoot = resolve(import.meta.dirname, "..");
const requiredFiles = [
  "manifest.json",
  "options.html",
  "sidepanel.html",
  "background.js",
  "content.js",
  "noise.svg",
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

const expectedPermissions = ["activeTab", "scripting", "sidePanel", "storage"];
const actualPermissions = [...manifest.permissions].sort();
if (JSON.stringify(actualPermissions) !== JSON.stringify(expectedPermissions)) {
  throw new Error(`Unexpected manifest permissions: ${actualPermissions.join(", ")}`);
}

if (manifest.host_permissions || manifest.optional_host_permissions) {
  throw new Error("The MVP distribution must not request persistent host permissions.");
}

if (manifest.background?.service_worker !== "background.js") {
  throw new Error("Manifest background service worker is not wired to background.js.");
}

console.log(`Verified ${requiredFiles.length} required distribution files.`);
console.log(`Verified least-privilege permissions: ${actualPermissions.join(", ")}.`);
