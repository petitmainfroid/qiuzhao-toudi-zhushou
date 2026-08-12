import { auditXiaomiObservationFile } from "./ats-corpus/xiaomi-observation-audit.mjs";

function usage() {
  console.error("Usage: npm run audit:xiaomi-observation -- <observation.json> [--k1-controls <count>] [--dry-run]");
}

function parseArguments(args) {
  let inputPath = "";
  let k1ControlCount = null;
  for (let index = 0; index < args.length; index += 1) {
    const value = args[index];
    if (value === "--dry-run") continue;
    if (value === "--k1-controls") {
      const next = Number(args[index + 1]);
      if (!Number.isInteger(next) || next < 0) throw new Error("--k1-controls requires a non-negative integer.");
      k1ControlCount = next;
      index += 1;
      continue;
    }
    if (value.startsWith("--")) throw new Error(`Unknown option: ${value}`);
    if (inputPath) throw new Error("Exactly one observation JSON file is required.");
    inputPath = value;
  }
  if (!inputPath) throw new Error("An observation JSON file is required.");
  return { inputPath, k1ControlCount };
}

try {
  const { inputPath, k1ControlCount } = parseArguments(process.argv.slice(2));
  const result = await auditXiaomiObservationFile(inputPath, {
    projectRoot: process.cwd(),
    k1ControlCount
  });
  console.log(JSON.stringify(result, null, 2));
  if (!result.passed) process.exitCode = 1;
}
catch (error) {
  usage();
  const code = typeof error?.code === "string" ? error.code : "audit-failed";
  console.error(`Xiaomi observation audit failed (${code}). The file was rejected without printing captured values.`);
  process.exitCode = 1;
}
