import { importAtsCorpusSample } from "./core.mjs";

const args = process.argv.slice(2);
const dryRunIndex = args.indexOf("--dry-run");
const dryRun = dryRunIndex >= 0;
if (dryRun) args.splice(dryRunIndex, 1);

if (args.length !== 1 || args[0].startsWith("--")) {
  console.error("Usage: npm run corpus:import -- <observation.json> [--dry-run]");
  process.exit(2);
}

try {
  const result = await importAtsCorpusSample(args[0], { dryRun });
  console.log(
    `ATS corpus import ${result.status}: family=${result.family} page=${result.pageType} digest=${result.digest.slice(0, 16)} target=${result.relativePath}`
  );
}
catch (error) {
  const code = typeof error?.code === "string" ? error.code : "unexpected";
  const message = error instanceof Error ? error.message : "Unexpected ATS corpus import failure.";
  console.error(`ATS corpus import failed [${code}]: ${message}`);
  process.exit(1);
}
