import { describe, expect, it } from "vitest";
import { extractPageSections } from "./index";

let id = 1;
const text = (value: string) => ({ nodeType: 3, nodeName: "#text", nodeValue: value });
const element = (nodeName: string, children: any[] = [], attributes: string[] = []) => ({ nodeType: 1, nodeName, localName: nodeName, backendNodeId: id++, attributes, children });

describe("section extractor", () => {
  it("assigns controls to semantic sections without page values or selectors", () => {
    id = 1;
    const root = element("html", [element("body", [
      element("section", [element("h2", [text("教育背景")]), element("input"), element("input")]),
      element("section", [element("h2", [text("实习经历")]), element("input"), element("textarea")])
    ])]);
    const sections = extractPageSections(root, { referenceControl: (backendNodeId) => `control_${backendNodeId}` });
    expect(sections.map(({ kind, heading, recordIndex, controlRefs }) => ({ kind, heading, recordIndex, controlCount: controlRefs.length }))).toEqual([
      { kind: "education", heading: "教育背景", recordIndex: 0, controlCount: 2 },
      { kind: "internship", heading: "实习经历", recordIndex: 0, controlCount: 2 }
    ]);
    expect(JSON.stringify(sections)).not.toContain("selector");
  });

  it("does not turn field captions inside a section into nested sections", () => {
    id = 1;
    const root = element("html", [element("body", [element("section", [
      element("h2", [text("教育经历")]),
      element("label", [text("学历")]), element("input"),
      element("label", [text("专业")]), element("input")
    ])])]);
    expect(extractPageSections(root, { referenceControl: (backendNodeId) => `control_${backendNodeId}` })
      .map((section) => section.kind)).toEqual(["education"]);
  });

  it("does not promote an exact section phrase used as a form field caption", () => {
    id = 1;
    const root = element("html", [element("body", [
      element("section", [
        element("div", [text("个人信息")], ["class", "blockTitle"]),
        element("div", [
          element("div", [text("工作经验")], ["class", "title"]),
          element("input")
        ], ["class", "apply-field"])
      ]),
      element("section", [element("div", [text("工作经历")], ["class", "blockTitle"]), element("input")])
    ])]);
    expect(extractPageSections(root, { referenceControl: (backendNodeId) => `control_${backendNodeId}` })
      .map(({ kind, heading, recordIndex }) => ({ kind, heading, recordIndex }))).toEqual([
      { kind: "basic", heading: "个人信息", recordIndex: 0 },
      { kind: "work", heading: "工作经历", recordIndex: 0 }
    ]);
  });
});
