import { describe, expect, it } from "vitest";
import { createEmptyProfile } from "../domain/profile";
import { fillPage, scanPage } from "../content/engine";
import type { FieldDescriptor } from "../matching/types";
import {
  defaultAtsFamilyRegistry,
  defaultAtsTemplateRegistry,
  feishuRecruitingTemplate
} from "./defaultTemplates";
import { AtsMatchingRuntime, atsPathTemplate, matchFieldWithAtsTemplate } from "./matchingRuntime";

function descriptor(overrides: Partial<FieldDescriptor> = {}): FieldDescriptor {
  return {
    elementId: "field-1",
    tagName: "input",
    inputType: "text",
    kind: "text",
    label: "",
    ariaLabel: "",
    placeholder: "",
    name: "",
    domId: "",
    autocomplete: "",
    contextText: "",
    options: [],
    disabled: false,
    readOnly: false,
    ...overrides
  };
}

class FeishuTestRuntime extends AtsMatchingRuntime {
  constructor() {
    super(defaultAtsFamilyRegistry, defaultAtsTemplateRegistry);
  }

  override resolve(descriptors: readonly FieldDescriptor[]) {
    return super.resolve(descriptors, {
      origin: "https://xiaomi.jobs.f.mioffice.cn",
      pathname: "/internship/resume/7663053400020879658/apply"
    });
  }
}

describe("ATS matching runtime", () => {
  const runtime = () => new AtsMatchingRuntime(defaultAtsFamilyRegistry, defaultAtsTemplateRegistry);

  it("resolves every reviewed Feishu field rule without profile data", () => {
    for (const rule of feishuRecruitingTemplate.fieldRules) {
      const semanticKey = rule.semanticKeys[0].replace("[]", "[0]");
      const matched = matchFieldWithAtsTemplate(descriptor({ name: semanticKey }), feishuRecruitingTemplate);
      if (rule.action === "exclude") {
        expect(matched.excludedReason, rule.id).toBeTruthy();
        expect(matched.profilePath, rule.id).toBeNull();
      }
      else {
        expect(matched.profilePath, rule.id).toBe(rule.profilePathPattern?.replace("{index}", "0"));
        expect(matched.confidence, rule.id).toBe("high");
      }
    }
  });

  it("detects a reviewed Feishu deployment and maps indexed semantic keys", () => {
    const atsRuntime = runtime();
    const education = descriptor({ name: "education_list[1].school", label: "学校名称" });
    const session = atsRuntime.resolve([education], {
      origin: "https://xiaomi.jobs.f.mioffice.cn",
      pathname: "/internship/resume/7663053400020879658/apply?private=ignored"
    });
    expect(atsPathTemplate("/internship/resume/7663053400020879658/apply?private=ignored")).toBe(
      "/internship/resume/:id/apply"
    );
    expect(session.metadata).toMatchObject({
      familyId: "feishu-recruiting",
      mappingSource: "family-template",
      templateVersion: "1"
    });
    expect(session.match(education)).toMatchObject({
      profilePath: "education.1.school",
      confidence: "high",
      requiresConfirmation: false,
      atsTemplate: {
        familyId: "feishu-recruiting",
        ruleId: "education-school",
        driverHint: "native"
      }
    });
  });

  it("keeps sensitive template fields confirm-only and final submission excluded", () => {
    const atsRuntime = runtime();
    const identity = descriptor({ name: "basic_info.identification", label: "个人证件" });
    const submit = descriptor({ kind: "text", label: "提交申请", name: "application_action" });
    const session = atsRuntime.resolve([identity], {
      origin: "https://xiaomi.jobs.f.mioffice.cn",
      pathname: "/internship/resume/100000/apply"
    });
    expect(session.match(identity)).toMatchObject({
      profilePath: "basic.identityDocumentNumber",
      confidence: "high",
      requiresConfirmation: true
    });
    expect(session.match(submit)).toMatchObject({
      profilePath: null,
      excludedReason: "unsupported-control",
      confidence: "none"
    });
  });

  it("uses generic matching outside reviewed family evidence", () => {
    const atsRuntime = runtime();
    const email = descriptor({ label: "电子邮箱", inputType: "email", kind: "email" });
    const session = atsRuntime.resolve([email], {
      origin: "https://careers.example.test",
      pathname: "/apply/ordinary"
    });
    expect(session.metadata).toMatchObject({ familyId: "generic-html", mappingSource: "generic" });
    const matched = session.match(email);
    expect(matched).toMatchObject({ profilePath: "basic.email" });
    expect(matched).not.toHaveProperty("atsTemplate");
  });

  it("applies saved site corrections above the family template during scan and verified fill", async () => {
    document.body.innerHTML = `<label>姓名<input name="basic_info.name"></label>`;
    const profile = createEmptyProfile();
    profile.basic.fullName = "Template Name";
    profile.basic.email = "saved@example.test";
    const runtime = new FeishuTestRuntime();

    const templated = scanPage(profile, [], runtime);
    expect(templated.ats?.familyId).toBe("feishu-recruiting");
    expect(templated.fields[0]).toMatchObject({
      profilePath: "basic.fullName",
      mappingSource: "rule",
      atsTemplate: { ruleId: "basic-name" }
    });

    const mappings = [{
      site: templated.site,
      fingerprint: templated.fields[0].fingerprint,
      profilePath: "basic.email",
      canonicalLabel: "邮箱",
      updatedAt: "2026-08-07T00:00:00.000Z"
    }];
    const corrected = scanPage(profile, mappings, runtime);
    expect(corrected.fields[0]).toMatchObject({
      profilePath: "basic.email",
      mappingSource: "saved",
      confidence: "high"
    });

    const result = await fillPage(profile, [{
      elementId: corrected.fields[0].elementId,
      profilePath: "basic.email"
    }], mappings, runtime);
    expect(result).toMatchObject({ filledCount: 1, skippedCount: 0 });
    expect((document.querySelector("input") as HTMLInputElement).value).toBe("saved@example.test");
  });
});
