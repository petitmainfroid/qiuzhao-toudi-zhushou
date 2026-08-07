import { mkdtemp, readFile, rename, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  importAtsCorpusSample,
  normalizeCorpusInput,
  verifyAtsCorpus
} from "../../scripts/ats-corpus/core.mjs";

function observation(capturedAt = "2026-08-06T12:00:00.000Z", captureToolVersion = "0.2.0") {
  return {
    schemaVersion: 1,
    capturedAt,
    source: {
      origin: "https://jobs.example.test",
      pathTemplate: "/campus/apply/:id",
      language: "zh-CN",
      pageType: "application",
      captureToolVersion
    },
    family: {
      id: "generic-html",
      version: "1",
      confidence: 0,
      evidence: [{ kind: "control-structure", detail: "generic fallback" }]
    },
    sections: ["教育经历"],
    controls: [
      {
        controlKey: "control_0001",
        role: "textbox",
        tag: "input",
        inputType: "text",
        semantics: {
          label: "毕业院校",
          name: "education.school"
        },
        disabled: false,
        readOnly: false,
        required: true,
        multiple: false,
        boundary: "main",
        safety: "ordinary"
      }
    ],
    summary: {
      controlCount: 1,
      blockedControlCount: 0,
      frameControlCount: 0,
      openShadowControlCount: 0,
      sectionCount: 1
    },
    privacy: {
      currentValuesIncluded: false,
      sessionReferencesIncluded: false,
      queryValuesIncluded: false,
      fileMetadataIncluded: false
    }
  };
}

describe("ATS corpus importer", () => {
  let testRoot: string;
  let corpusRoot: string;

  beforeEach(async () => {
    testRoot = await mkdtemp(join(tmpdir(), "ats-corpus-test-"));
    corpusRoot = join(testRoot, "corpus");
  });

  afterEach(async () => {
    await rm(testRoot, { recursive: true, force: true });
  });

  async function inputFile(name: string, value: unknown): Promise<string> {
    const path = join(testRoot, name);
    await writeFile(path, JSON.stringify(value), "utf8");
    return path;
  }

  it("wraps a raw observation, imports it deterministically, and ignores capture time for duplicates", async () => {
    const firstInput = await inputFile("first.json", observation());
    const first = await importAtsCorpusSample(firstInput, { corpusRoot, projectRoot: process.cwd() });

    expect(first).toMatchObject({
      status: "imported",
      family: "generic-html",
      pageType: "application"
    });
    expect(first.relativePath).toMatch(/^samples\/generic-html\/application-[a-f0-9]{16}\.json$/);

    const stored = JSON.parse(await readFile(join(corpusRoot, first.relativePath), "utf8"));
    expect(stored.corpusSchemaVersion).toBe(1);
    expect(stored.annotations).toMatchObject({
      reviewStatus: "unreviewed",
      reviewedAt: null,
      reviewedFamilyId: null
    });
    expect(stored.annotations.controls[0]).toMatchObject({
      controlKey: "control_0001",
      canonicalField: null,
      section: null,
      behaviors: ["native-input"],
      expectedAction: "unknown"
    });

    const secondInput = await inputFile("second.json", observation("2026-08-06T13:00:00.000Z", "0.3.0"));
    const second = await importAtsCorpusSample(secondInput, { corpusRoot, projectRoot: process.cwd() });
    expect(second.status).toBe("duplicate");
    expect(second.relativePath).toBe(first.relativePath);

    await expect(verifyAtsCorpus({ corpusRoot, projectRoot: process.cwd() })).resolves.toEqual({
      sampleCount: 1,
      totalBytes: expect.any(Number),
      families: ["generic-html"]
    });
  });

  it("exposes a non-writing dry-run through the developer CLI", async () => {
    const path = await inputFile("dry-run.json", observation());
    const result = spawnSync(
      process.execPath,
      ["scripts/ats-corpus/import.mjs", path, "--dry-run"],
      { cwd: process.cwd(), encoding: "utf8" }
    );

    expect(result.status).toBe(0);
    expect(result.stdout).toContain("ATS corpus import validated");
    expect(result.stdout).toContain("family=generic-html");
    expect(result.stderr).toBe("");
  });

  it("accepts reviewed section, behavior, mapping, driver, and verification annotations", async () => {
    const sample = normalizeCorpusInput(observation()) as any;
    sample.annotations.reviewStatus = "reviewed";
    sample.annotations.reviewedAt = "2026-08-06T14:00:00.000Z";
    sample.annotations.reviewedFamilyId = "generic-html";
    Object.assign(sample.annotations.controls[0], {
      canonicalField: "education[].school",
      section: "教育经历",
      behaviors: ["native-input", "validation-on-blur"],
      expectedAction: "fill",
      expectedDriver: "native-text",
      expectedVerification: "normalized-equality",
      notes: "普通文本字段"
    });

    const path = await inputFile("reviewed.json", sample);
    await expect(importAtsCorpusSample(path, { corpusRoot, projectRoot: process.cwd() })).resolves.toMatchObject({
      status: "imported",
      family: "generic-html"
    });
  });

  it("rejects malformed and schema-invalid input before writing", async () => {
    const malformedPath = join(testRoot, "malformed.json");
    await writeFile(malformedPath, "{", "utf8");
    await expect(importAtsCorpusSample(malformedPath, { corpusRoot, projectRoot: process.cwd() })).rejects.toMatchObject({
      code: "input-invalid"
    });

    const invalid = observation() as any;
    invalid.controls[0].tag = "script";
    const invalidPath = await inputFile("invalid.json", invalid);
    await expect(importAtsCorpusSample(invalidPath, { corpusRoot, projectRoot: process.cwd() })).rejects.toMatchObject({
      code: "schema-invalid"
    });
    await expect(verifyAtsCorpus({ corpusRoot, projectRoot: process.cwd() })).resolves.toMatchObject({ sampleCount: 0 });
  });

  it("rejects annotation/control mismatches", async () => {
    const sample = normalizeCorpusInput(observation()) as any;
    sample.annotations.controls = [];
    const path = await inputFile("mismatch.json", sample);

    await expect(importAtsCorpusSample(path, { corpusRoot, projectRoot: process.cwd() })).rejects.toMatchObject({
      code: "invariant-failed"
    });
  });

  it("rejects personal data and local paths even when the JSON shape is valid", async () => {
    const emailSample = observation() as any;
    emailSample.controls[0].semantics.label = "candidate@example.com";
    const emailPath = await inputFile("email.json", emailSample);
    await expect(importAtsCorpusSample(emailPath, { corpusRoot, projectRoot: process.cwd() })).rejects.toMatchObject({
      code: "privacy-failed"
    });

    const pathSample = normalizeCorpusInput(observation()) as any;
    pathSample.annotations.controls[0].notes = "C:\\Users\\candidate\\resume.pdf";
    const localPath = await inputFile("local-path.json", pathSample);
    await expect(importAtsCorpusSample(localPath, { corpusRoot, projectRoot: process.cwd() })).rejects.toMatchObject({
      code: "privacy-failed"
    });
  });

  it("rejects upload metadata, displayed date values, and ordinary-classified final submit controls", async () => {
    const fileMetadata = observation() as any;
    fileMetadata.controls[0].semantics.label = "synthetic-private-resume.pdf";
    await expect(importAtsCorpusSample(
      await inputFile("file-metadata.json", fileMetadata),
      { corpusRoot, projectRoot: process.cwd(), dryRun: true }
    )).rejects.toMatchObject({ code: "privacy-failed" });

    const dateDisplay = observation() as any;
    dateDisplay.controls[0].semantics.nearbyText = "2024-09 - 2026-06";
    await expect(importAtsCorpusSample(
      await inputFile("date-display.json", dateDisplay),
      { corpusRoot, projectRoot: process.cwd(), dryRun: true }
    )).rejects.toMatchObject({ code: "privacy-failed" });

    const unsafeSubmit = observation() as any;
    unsafeSubmit.controls[0].role = "button";
    unsafeSubmit.controls[0].tag = "button";
    unsafeSubmit.controls[0].semantics.label = "提交简历";
    await expect(importAtsCorpusSample(
      await inputFile("unsafe-submit.json", unsafeSubmit),
      { corpusRoot, projectRoot: process.cwd(), dryRun: true }
    )).rejects.toMatchObject({ code: "safety-failed" });
    await expect(verifyAtsCorpus({ corpusRoot, projectRoot: process.cwd() })).resolves.toMatchObject({ sampleCount: 0 });
  });

  it("refuses annotation conflicts instead of overwriting an existing structure", async () => {
    const rawPath = await inputFile("raw.json", observation());
    await importAtsCorpusSample(rawPath, { corpusRoot, projectRoot: process.cwd() });

    const changed = normalizeCorpusInput(observation()) as any;
    changed.annotations.controls[0].canonicalField = "education[].school";
    changed.annotations.controls[0].expectedAction = "fill";
    const changedPath = await inputFile("changed.json", changed);

    await expect(importAtsCorpusSample(changedPath, { corpusRoot, projectRoot: process.cwd() })).rejects.toMatchObject({
      code: "annotation-conflict"
    });
  });

  it("detects a committed sample outside its deterministic path", async () => {
    const path = await inputFile("raw.json", observation());
    const imported = await importAtsCorpusSample(path, { corpusRoot, projectRoot: process.cwd() });
    const original = join(corpusRoot, imported.relativePath);
    const misplaced = join(corpusRoot, "samples", "generic-html", "application-wrong.json");
    await rename(original, misplaced);

    await expect(verifyAtsCorpus({ corpusRoot, projectRoot: process.cwd() })).rejects.toMatchObject({
      code: "placement-invalid"
    });
  });
});
