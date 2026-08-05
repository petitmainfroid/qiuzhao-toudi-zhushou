import { createHash } from "node:crypto";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { extname, join, resolve } from "node:path";
import { expect, test } from "@playwright/test";
import {
  assertResumeCompletenessObservation,
  buildRedactedResumeSample,
  type ResumeCompletenessObservation,
  type ResumeFormat
} from "../../src/evaluation/resumeCompletenessPolicy";
import type { CandidateProfile } from "../../src/domain/profile";

test("resume completeness evaluation records the digest-allowlisted local corpus", async ({ page }) => {
  test.setTimeout(8 * 60 * 1000);
  const manifest = JSON.parse(await readFile(resolve(process.cwd(), "evals", "resume-corpus-manifest.json"), "utf8")) as {
    suiteVersion: string;
    samples: Array<{ sampleId: string; format: ResumeFormat }>;
  };
  const downloadsRoot = join(homedir(), "Downloads");
  const entries = await readdir(downloadsRoot, { withFileTypes: true });
  const wanted = new Map(manifest.samples.map((sample) => [sample.sampleId, sample]));
  const selected = new Map<string, { localPath: string; format: ResumeFormat }>();

  for (const entry of entries) {
    if (!entry.isFile() || !/\.(pdf|docx)$/i.test(entry.name)) continue;
    const localPath = join(downloadsRoot, entry.name);
    const bytes = await readFile(localPath);
    const sampleId = createHash("sha256").update(bytes).digest("hex").slice(0, 8).toUpperCase();
    const expected = wanted.get(sampleId);
    if (!expected || selected.has(sampleId)) continue;
    const format = extname(entry.name).slice(1).toLowerCase() as ResumeFormat;
    if (format !== expected.format) throw new Error(`Digest ${sampleId} has an unexpected format.`);
    selected.set(sampleId, { localPath, format });
  }

  expect([...selected.keys()].sort()).toEqual([...wanted.keys()].sort());
  await page.goto("/options.html");
  await page.evaluate(() => {
    const input = document.createElement("input");
    input.type = "file";
    input.id = "resume-completeness-source";
    document.body.append(input);
  });

  const samples = [];
  for (const expected of manifest.samples) {
    const source = selected.get(expected.sampleId);
    if (!source) throw new Error(`Digest ${expected.sampleId} was not found.`);
    await page.locator("#resume-completeness-source").setInputFiles(source.localPath);
    const localResult = await page.evaluate(async () => {
      const input = document.querySelector<HTMLInputElement>("#resume-completeness-source");
      const file = input?.files?.[0];
      if (!file) throw new Error("Audit source was not attached.");
      const extractorPath = "/src/resume/extractResumeText.ts";
      const parserPath = "/src/resume/parseResume.ts";
      const extractor = await import(/* @vite-ignore */ extractorPath);
      const parser = await import(/* @vite-ignore */ parserPath);
      const extracted = await extractor.extractResumeText(file);
      const parsed = parser.parseResumeText(extracted.text);
      return {
        format: extracted.format as ResumeFormat,
        sourceText: extracted.text as string,
        pageCount: extracted.pageCount as number | undefined,
        usedOcr: extracted.usedOcr === true,
        profile: parsed.profile as CandidateProfile,
        parserWarningCount: (parsed.warnings as unknown[]).length
      };
    });
    samples.push(buildRedactedResumeSample({
      sampleId: expected.sampleId,
      format: localResult.format,
      pageCount: localResult.pageCount,
      usedOcr: localResult.usedOcr,
      sourceText: localResult.sourceText,
      profile: localResult.profile,
      parserWarningCount: localResult.parserWarningCount
    }));
  }

  const observation: ResumeCompletenessObservation = {
    schemaVersion: 1,
    suiteVersion: manifest.suiteVersion,
    generatedAt: new Date().toISOString(),
    corpusScope: "historical-digest-allowlist",
    directIdentifiersRemoved: true,
    samples
  };
  assertResumeCompletenessObservation(observation);
  const artifactsRoot = resolve(process.cwd(), "artifacts");
  await mkdir(artifactsRoot, { recursive: true });
  await writeFile(
    resolve(artifactsRoot, "resume-completeness-observation.json"),
    `${JSON.stringify(observation, null, 2)}\n`,
    "utf8"
  );

  expect(samples).toHaveLength(manifest.samples.length);
  expect(samples.every((sample) => sample.redactionCount > 0)).toBe(true);
  expect(samples.every((sample) => sample.sourceLineCount > 0 && sample.parsedFacts.length > 0)).toBe(true);
});
