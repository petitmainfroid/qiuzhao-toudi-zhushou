import { verifyAtsCorpus } from "./core.mjs";

try {
  const result = await verifyAtsCorpus();
  const families = result.families.length > 0 ? result.families.join(",") : "none";
  console.log(`Verified ATS corpus: samples=${result.sampleCount} bytes=${result.totalBytes} families=${families}.`);
}
catch (error) {
  const code = typeof error?.code === "string" ? error.code : "unexpected";
  const message = error instanceof Error ? error.message : "Unexpected ATS corpus verification failure.";
  console.error(`ATS corpus verification failed [${code}]: ${message}`);
  process.exit(1);
}
