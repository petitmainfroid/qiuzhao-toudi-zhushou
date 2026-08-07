import { describe, expect, it } from "vitest";
import { feishuRecruitingTemplate, genericHtmlTemplate } from "./defaultTemplates";
import { AtsTemplateRegistry, validateAtsFamilyTemplate } from "./templateRegistry";

describe("ATS family template registry", () => {
  it("accepts the generic and Feishu Recruiting templates and falls back deterministically", () => {
    expect(validateAtsFamilyTemplate(feishuRecruitingTemplate)).toBe(feishuRecruitingTemplate);
    const registry = new AtsTemplateRegistry([genericHtmlTemplate, feishuRecruitingTemplate]);
    expect(registry.resolve("feishu-recruiting")?.version).toBe("1");
    expect(registry.resolve("unknown-family")?.familyId).toBe("generic-html");
  });

  it("rejects profile-like values, raw HTML, remote URLs, and duplicate templates", () => {
    expect(() => validateAtsFamilyTemplate({
      ...genericHtmlTemplate,
      familyId: "unsafe-values",
      sections: [{ id: "private", labels: ["candidate@example.test"] }]
    })).toThrow(/Unsafe/);
    expect(() => validateAtsFamilyTemplate({
      ...genericHtmlTemplate,
      familyId: "unsafe-html",
      finalSubmitExclusions: ["<button>submit</button>"]
    })).toThrow(/Unsafe/);
    expect(() => validateAtsFamilyTemplate({
      ...genericHtmlTemplate,
      familyId: "unsafe-remote",
      sections: [{ id: "remote", labels: ["https://private.example/config"] }]
    })).toThrow(/Unsafe/);
    expect(() => new AtsTemplateRegistry([genericHtmlTemplate, genericHtmlTemplate])).toThrow(/Duplicate/);
  });
});
