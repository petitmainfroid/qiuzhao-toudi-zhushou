import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Ajv2020 from "ajv/dist/2020.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const evalRoot = path.join(root, "evals/real-pages");
const registry = JSON.parse(fs.readFileSync(path.join(evalRoot, "registry.json"), "utf8"));
const allowedSites = new Set(["xiaomi-feishu", "metaapp-feishu", "nio-feishu", "anker-feishu", "hesai-feishu", "huya-moka", "lenovo-talent", "ctrip-careers"]);

assert.equal(registry.length, 8, "Registry must contain exactly eight retained pages.");
assert.deepEqual(new Set(registry.map((entry) => entry.siteId)), allowedSites, "Registry site IDs drifted.");
assert.equal(new Set(registry.map((entry) => `${entry.origin}${entry.normalizedPath}`)).size, 8, "Registry contains duplicate page identities.");
assert.equal(registry.reduce((sum, entry) => sum + entry.historicalFieldDefinitions, 0), 243, "Historical provenance count drifted.");
assert.ok(registry.every((entry) => entry.groundTruthClass === "public-contract-drift"), "Ground truth must remain drift-only evidence.");
assert.ok(registry.every((entry) => fs.existsSync(path.join(root, entry.groundTruthRef))), "A ground-truth provenance path is missing.");

const ajv = new Ajv2020({ allErrors: true, strict: true, formats: { "date-time": true } });
for (const name of ["annotation-v1.schema.json", "run-manifest-v1.schema.json", "judge-report-v1.schema.json"]) {
  const schema = JSON.parse(fs.readFileSync(path.join(evalRoot, "schemas", name), "utf8"));
  ajv.compile(schema);
}

const source = [
  ...fs.readdirSync(evalRoot, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => fs.readFileSync(path.join(entry.parentPath ?? entry.path, entry.name), "utf8"))
].join("\n");
assert.match(source, /reachable-field-instances/, "Runtime denominator source is not explicit.");
assert.doesNotMatch(source, /runtimeDenominator\s*[:=]\s*243/, "Historical 243-field provenance was reused as a runtime denominator.");

console.log("Real-page evaluation registry and schemas verified: 8 sites, 243 historical definitions (provenance only), 3 schemas.");
