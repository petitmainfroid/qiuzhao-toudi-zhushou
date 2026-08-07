import { describe, expect, it } from "vitest";
import { buildAtsDetectionContext } from "../../matchingRuntime";
import { defaultAtsFamilyRegistry } from "../../defaultTemplates";

const reviewedLocations = [
  ["https://xiaomi.jobs.f.mioffice.cn", "/internship/resume/7663053400020879658/apply"],
  ["https://nio.jobs.feishu.cn", "/index/resume/7665959622004705546/apply"],
  ["https://meta.jobs.feishu.cn", "/140297/resume/7667451369407023396/apply"],
  ["https://anker-in.jobs.feishu.cn", "/index/resume/7667516150482536746/apply"],
  ["https://kwh0jtf778.jobs.feishu.cn", "/index/resume/7670064234785491242/apply"]
] as const;

describe("Feishu Recruiting family detector", () => {
  it.each(reviewedLocations)("recognizes the reviewed tenant shape %s", (origin, pathname) => {
    const identity = defaultAtsFamilyRegistry.detect(buildAtsDetectionContext([], { origin, pathname }));
    expect(identity).toMatchObject({
      id: "feishu-recruiting",
      version: "1",
      confidence: 0.9
    });
    expect(identity.evidence.map((item) => item.kind)).toEqual(["origin", "path"]);
  });

  it("uses semantic markers as bounded supporting evidence", () => {
    const identity = defaultAtsFamilyRegistry.detect(buildAtsDetectionContext([{
      elementId: "field-1",
      tagName: "input",
      inputType: "text",
      kind: "text",
      label: "姓名",
      ariaLabel: "",
      placeholder: "",
      name: "basic_info.name",
      domId: "",
      autocomplete: "",
      contextText: "基本信息",
      options: [],
      disabled: false,
      readOnly: false
    }], {
      origin: "https://nio.jobs.feishu.cn",
      pathname: "/index/resume/7665959622004705546/apply"
    }));
    expect(identity.confidence).toBe(0.916);
    expect(identity.evidence.at(-1)).toEqual({
      kind: "semantic-marker",
      detail: "1 Feishu resume schema markers"
    });
  });

  it.each([
    ["https://jobs.feishu.cn.evil.example", "/index/resume/7665959622004705546/apply"],
    ["https://careers.example.test", "/index/resume/7665959622004705546/apply"],
    ["http://nio.jobs.feishu.cn", "/index/resume/7665959622004705546/apply"]
  ])("rejects lookalike or untrusted origin %s", (origin, pathname) => {
    expect(defaultAtsFamilyRegistry.detect(buildAtsDetectionContext([], { origin, pathname })).id)
      .toBe("generic-html");
  });
});
