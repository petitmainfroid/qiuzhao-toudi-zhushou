import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { expect, test } from "@playwright/test";
import suite from "../../evals/fill-quality-suite.json" with { type: "json" };
import {
  buildFillQualityReport,
  type FillQualityCaseObservation,
  type FillQualityObservationArtifact
} from "../../src/evaluation/fillQuality";

const genericProfile = {
  schemaVersion: 2 as const,
  updatedAt: "",
  basic: {
    fullName: "Synthetic Candidate",
    preferredName: "",
    gender: "女",
    birthDate: "",
    phone: "",
    email: "synthetic@example.test",
    nationality: "",
    currentCity: "",
    hometown: "",
    politicalStatus: ""
  },
  education: [{
    id: "synthetic-education",
    school: "",
    degree: "本科",
    educationType: "",
    major: "",
    startDate: "",
    endDate: "",
    gpa: "",
    ranking: ""
  }],
  workExperiences: [],
  projects: [{
    id: "synthetic-project",
    name: "",
    role: "",
    startDate: "",
    endDate: "",
    description: "Synthetic project description.",
    outcome: "",
    link: ""
  }],
  workSamples: [],
  awards: [],
  languages: [],
  jobPreference: { targetRoles: "", preferredCities: "", availableDate: "" },
  answers: { selfIntroduction: "", selfEvaluation: "", strengths: "", careerPlan: "" }
};

const xiaomiProfile = {
  schemaVersion: 2 as const,
  updatedAt: "",
  basic: {
    fullName: "Synthetic Candidate",
    preferredName: "",
    gender: "女",
    birthDate: "2000-01-01",
    phone: "13800000000",
    email: "synthetic@example.test",
    nationality: "中国",
    currentCity: "Test City",
    hometown: "北京",
    politicalStatus: ""
  },
  education: [
    { id: "synthetic-edu-0", school: "Synthetic University A", degree: "硕士", educationType: "统招全日制", major: "Testing", startDate: "2024-09", endDate: "2027-06", gpa: "", ranking: "" },
    { id: "synthetic-edu-1", school: "Synthetic University B", degree: "本科", educationType: "统招全日制", major: "Computing", startDate: "2020-09", endDate: "2024-06", gpa: "", ranking: "" }
  ],
  workExperiences: [{ id: "synthetic-work", company: "Synthetic Company", department: "Testing", role: "Test Intern", startDate: "2025-01", endDate: "2025-06", description: "Synthetic work description." }],
  projects: [{ id: "synthetic-project", name: "Synthetic Project", role: "Owner", startDate: "2025-02", endDate: "2025-08", description: "Synthetic project description.", outcome: "Synthetic outcome.", link: "https://example.test/project" }],
  workSamples: [{ id: "synthetic-sample", link: "https://example.test/portfolio", description: "Synthetic sample description." }],
  awards: [{ id: "synthetic-award", name: "Synthetic Award", date: "2025-06", description: "Synthetic award description." }],
  languages: [{ id: "synthetic-language", language: "英语", proficiency: "商务会话" }],
  jobPreference: { targetRoles: "Test Intern", preferredCities: "北京", availableDate: "" },
  answers: { selfIntroduction: "", selfEvaluation: "Synthetic self evaluation.", strengths: "", careerPlan: "" }
};

async function observePage(
  page: import("@playwright/test").Page,
  pagePath: string,
  fixtureName: "__qiuzhaoFixture" | "__xiaomiFixture",
  caseId: string,
  profile: typeof genericProfile | typeof xiaomiProfile,
  specs: Array<{ fieldKey: string; expectedPath: string | null; expectedAction: "fill" | "exclude" }>
): Promise<{ observation: FillQualityCaseObservation; attachment?: { status: string; candidateCount: number } }> {
  await page.goto(pagePath);
  const result = await page.evaluate(async ({ fixtureName, caseId, profile, specs }) => {
    const fixture = (window as unknown as Record<string, {
      scan: (candidate: typeof profile) => ReturnType<Window["__qiuzhaoFixture"]["scan"]>;
      fill: Window["__qiuzhaoFixture"]["fill"];
      submitCount: number;
    }>)[fixtureName];
    const scan = fixture.scan(profile);

    function fieldKey(elementId: string): string {
      const escaped = typeof CSS.escape === "function" ? CSS.escape(elementId) : elementId;
      const element = document.querySelector<HTMLElement>(`[data-qiuzhao-field-id="${escaped}"]`);
      if (!element) return `missing:${elementId}`;
      if (element instanceof HTMLInputElement && element.type === "radio") return `radio:${element.name}`;
      const name = element.getAttribute("name");
      if (name) return name;
      const formName = element.closest("[data-form-field-name]")?.getAttribute("data-form-field-name");
      return formName || element.id || `anonymous:${elementId}`;
    }

    const grouped = new Map<string, typeof scan.fields>();
    for (const field of scan.fields) {
      const key = fieldKey(field.elementId);
      grouped.set(key, [...(grouped.get(key) ?? []), field]);
    }
    const expectedKeys = new Set(specs.map((entry) => entry.fieldKey));
    const selections: Array<{ elementId: string; profilePath: string }> = [];
    const observations = specs.map((spec, index) => {
      const candidates = grouped.get(spec.fieldKey) ?? [];
      const actual = candidates[0];
      if (spec.expectedAction === "fill" && actual?.profilePath) {
        selections.push({ elementId: actual.elementId, profilePath: actual.profilePath });
      }
      return {
        evidenceId: `${caseId}:field-${String(index + 1).padStart(2, "0")}`,
        fieldKey: spec.fieldKey,
        expectedAction: spec.expectedAction,
        expectedPath: spec.expectedPath,
        actualPath: actual?.profilePath ?? null,
        confidence: actual?.confidence ?? "none",
        excludedReason: actual?.excludedReason ?? null,
        actualOutcome: actual
          ? spec.expectedAction === "exclude" && actual.excludedReason ? "excluded" : "skipped"
          : "missing",
        fillReason: null,
        valueExact: null,
        elementId: actual?.elementId ?? null
      };
    });
    for (const [key, candidates] of grouped) {
      if (expectedKeys.has(key)) continue;
      const actual = candidates[0];
      observations.push({
        evidenceId: `${caseId}:unexpected-${observations.length + 1}`,
        fieldKey: key,
        expectedAction: "exclude",
        expectedPath: null,
        actualPath: actual.profilePath ?? null,
        confidence: actual.confidence,
        excludedReason: actual.excludedReason ?? null,
        actualOutcome: actual.excludedReason ? "excluded" : "unprotected",
        fillReason: null,
        valueExact: null,
        elementId: actual.elementId
      });
    }

    const fill = await fixture.fill(profile, selections);
    const outcomeByElement = new Map(fill.outcomes.map((outcome) => [outcome.elementId, outcome]));
    const sanitizedFields = observations.map(({ elementId, ...entry }) => {
      const outcome = elementId ? outcomeByElement.get(elementId) : undefined;
      if (entry.expectedAction !== "fill") return entry;
      return {
        ...entry,
        actualOutcome: outcome?.status === "filled" ? "filled" : outcome?.status === "skipped" ? "skipped" : "missing",
        fillReason: outcome?.reason ?? null,
        valueExact: outcome?.status === "filled"
      };
    });
    const generic = fixtureName === "__qiuzhaoFixture";
    const queryLength = (selector: string) => {
      const input = document.querySelector<HTMLInputElement>(selector);
      return input?.value.length ?? 0;
    };
    const fileCount = (selector: string) => document.querySelector<HTMLInputElement>(selector)?.files?.length ?? 0;
    const duplicateProposalCount = [...grouped.entries()]
      .filter(([key]) => expectedKeys.has(key))
      .reduce((sum, [, candidates]) => sum + Math.max(0, candidates.length - 1), 0);

    return {
      observation: {
        caseId,
        fields: sanitizedFields,
        duplicateProposalCount,
        safety: {
          submitClicks: fixture.submitCount,
          deleteClicks: 0,
          verificationMutations: generic ? queryLength("#captcha") : 0,
          passwordMutations: generic ? queryLength("#password") : 0,
          identityMutations: generic
            ? fileCount("#identity-attachment")
            : queryLength('[data-form-field-name="basic_info.identification"] input'),
          otherAttachmentMutations: generic
            ? fileCount("#resume")
            : fileCount('[data-form-field-name="works_list[0].attachment"] input')
        }
      },
      ...(generic ? {
        attachment: {
          status: scan.resumeAttachment?.status ?? "not-found",
          candidateCount: scan.resumeAttachment?.candidateCount ?? 0
        }
      } : {})
    };
  }, { fixtureName, caseId, profile, specs });
  return result as { observation: FillQualityCaseObservation; attachment?: { status: string; candidateCount: number } };
}

test("fill quality evaluation records synthetic browser ground truth", async ({ page }) => {
  const generic = await observePage(
    page,
    "/fixture.html",
    "__qiuzhaoFixture",
    "generic-form",
    genericProfile,
    suite.cases.generic as Array<{ fieldKey: string; expectedPath: string | null; expectedAction: "fill" | "exclude" }>
  );
  const xiaomi = await observePage(
    page,
    "/xiaomi-fixture.html",
    "__xiaomiFixture",
    "xiaomi-form",
    xiaomiProfile,
    suite.cases.xiaomi as Array<{ fieldKey: string; expectedPath: string | null; expectedAction: "fill" | "exclude" }>
  );

  await page.goto("/repeatable-fixture.html");
  const repeatable = await page.evaluate(async (profile) => {
    const before = window.__repeatableFixture.scanRepeatable(profile);
    const results = [
      await window.__repeatableFixture.create(profile, "projects"),
      await window.__repeatableFixture.create(profile, "education"),
      await window.__repeatableFixture.create(profile, "workExperiences"),
      await window.__repeatableFixture.create(profile, "workExperiences"),
      await window.__repeatableFixture.create(profile, "workSamples"),
      await window.__repeatableFixture.create(profile, "awards"),
      await window.__repeatableFixture.create(profile, "languages")
    ];
    const after = window.__repeatableFixture.scanRepeatable(profile);
    return {
      missingBefore: before.groups.reduce((sum, group) => sum + group.missingCount, 0),
      missingAfter: after.groups.reduce((sum, group) => sum + group.missingCount, 0),
      created: results.reduce((sum, result) => sum + result.createdCount, 0),
      deleteClicks: window.__repeatableFixture.deleteClickCount,
      submitClicks: window.__repeatableFixture.submitCount
    };
  }, {
    ...xiaomiProfile,
    education: xiaomiProfile.education,
    workExperiences: [
      xiaomiProfile.workExperiences[0],
      { ...xiaomiProfile.workExperiences[0], id: "synthetic-work-2", company: "Synthetic Company B" }
    ],
    projects: [
      xiaomiProfile.projects[0],
      { ...xiaomiProfile.projects[0], id: "synthetic-project-2", name: "Synthetic Project B" },
      { ...xiaomiProfile.projects[0], id: "synthetic-project-3", name: "Synthetic Project C" }
    ]
  });

  const repeatableCase: FillQualityCaseObservation = {
    caseId: "repeatable-records",
    fields: [],
    duplicateProposalCount: 0,
    safety: {
      submitClicks: repeatable.submitClicks,
      deleteClicks: repeatable.deleteClicks,
      verificationMutations: 0,
      passwordMutations: 0,
      identityMutations: 0,
      otherAttachmentMutations: 0
    }
  };
  const artifact: FillQualityObservationArtifact = {
    schemaVersion: 1,
    suiteVersion: suite.suiteVersion,
    generatedAt: new Date().toISOString(),
    syntheticOnly: true,
    cases: [generic.observation, xiaomi.observation, repeatableCase],
    repeatable: {
      expectedMissingBefore: suite.repeatable.expectedMissingBefore,
      actualMissingBefore: repeatable.missingBefore,
      expectedMissingAfter: suite.repeatable.expectedMissingAfter,
      actualMissingAfter: repeatable.missingAfter,
      expectedCreated: suite.repeatable.expectedCreated,
      actualCreated: repeatable.created
    },
    attachment: {
      expectedStatus: "ready",
      actualStatus: generic.attachment?.status ?? "not-found",
      expectedCandidateCount: suite.attachment.expectedCandidateCount,
      actualCandidateCount: generic.attachment?.candidateCount ?? 0,
      expectedOtherAttachmentMutations: suite.attachment.expectedOtherAttachmentMutations,
      actualOtherAttachmentMutations: generic.observation.safety.otherAttachmentMutations
    }
  };
  const report = buildFillQualityReport(artifact);
  const artifactDirectory = resolve("artifacts");
  await mkdir(artifactDirectory, { recursive: true });
  await writeFile(resolve(artifactDirectory, "fill-quality-observation.json"), `${JSON.stringify(artifact, null, 2)}\n`, "utf8");
  await writeFile(resolve(artifactDirectory, "fill-quality-report.json"), `${JSON.stringify(report, null, 2)}\n`, "utf8");

  expect(report.matching.precision).toBe(1);
  expect(report.matching.recall).toBe(1);
  expect(report.filling.exactRate).toBe(1);
  expect(report.exclusions.correctRate).toBe(1);
  expect(report.repeatableCoverage).toBe(1);
  expect(report.attachmentTargeting).toBe(1);
  expect(report.safety.pass).toBe(true);
});
