import { describe, expect, it } from "vitest";
import type { PowerSessionView } from "./protocol";
import {
  buildPrivacySafePageState,
  findPageControls,
  OpaqueReferenceRegistry,
  type CdpDomNode
} from "./pageState";

let backendNodeId = 1;

function text(value: string): CdpDomNode {
  return { backendNodeId: backendNodeId++, nodeType: 3, nodeName: "#text", nodeValue: value };
}

function element(name: string, attributes: Record<string, string> = {}, children: CdpDomNode[] = []): CdpDomNode {
  return {
    backendNodeId: backendNodeId++,
    nodeType: 1,
    nodeName: name.toUpperCase(),
    localName: name,
    attributes: Object.entries(attributes).flatMap(([key, value]) => [key, value]),
    children
  };
}

function fixtureRoot(): CdpDomNode {
  backendNodeId = 1;
  const root: CdpDomNode = {
    backendNodeId: backendNodeId++,
    nodeType: 9,
    nodeName: "#document",
    frameId: "main-frame",
    children: [element("html", {}, [element("body", {}, [
      element("label", { for: "school-field" }, [text("毕业院校")]),
      element("input", {
        id: "school-field",
        class: "private-class",
        name: "schoolName",
        value: "绝不能返回的学校值",
        required: ""
      }),
      element("textarea", { "aria-label": "项目描述", value: "绝不能返回的项目内容" }),
      element("input", { type: "PRIVATE-TYPE-SECRET", placeholder: "请输入联系电话", value: "13800138000" }),
      element("div", {}, [text("期望工作城市")]),
      element("div", { role: "combobox", "aria-expanded": "false" }),
      element("select", { "aria-label": "最高学历" }, [
        element("option", { value: "private-bachelor" }, [text("本科")]),
        element("option", { value: "private-master" }, [text("硕士")])
      ]),
      element("input", { type: "password", name: "accountPassword", value: "secret-password" }),
      element("button", { type: "button", id: "final-submit" }, [text("提交申请")]),
      {
        ...element("section"),
        shadowRoots: [{
          backendNodeId: backendNodeId++,
          nodeType: 11,
          nodeName: "#document-fragment",
          shadowRootType: "open",
          children: [element("input", { "aria-label": "作品集链接", value: "https://private.example" })]
        }]
      },
      {
        ...element("iframe"),
        contentDocument: {
          backendNodeId: backendNodeId++,
          nodeType: 9,
          nodeName: "#document",
          frameId: "child-frame",
          children: [element("input", { "aria-label": "推荐人姓名", value: "隐私姓名" })]
        }
      }
    ])])]
  };
  return root;
}

function xiaomiFailureShapeRoot(): CdpDomNode {
  backendNodeId = 1;
  const nest = (child: CdpDomNode, depth: number): CdpDomNode => {
    let current = child;
    for (let index = 0; index < depth; index += 1) current = element("div", { class: "control-shell" }, [current]);
    return current;
  };
  const field = (
    sectionClass: string,
    fieldName: string,
    label: string,
    control: CdpDomNode,
    required = false
  ) => element("section", { class: sectionClass }, [
    element("div", {
      class: "form-item",
      "data-form-field-name": fieldName,
      "data-form-field-i18n-name": label,
      ...(required ? { "data-form-field-required": "true" } : {})
    }, [control])
  ]);
  return {
    backendNodeId: backendNodeId++,
    nodeType: 9,
    nodeName: "#document",
    frameId: "main-frame",
    children: [element("html", {}, [element("body", {}, [
      element("section", { class: "uploadResume" }, [
        element("h2", {}, [text("简历")]),
        element("button", { type: "button", "aria-label": "上传简历" }),
        element("input", { type: "file", accept: "application/pdf" }),
        element("span", {}, [text("synthetic-candidate-private.pdf 上次上传 2026-08-07 10:30 更新 删除")])
      ]),
      element("section", { class: "resumeEditForm-basic" }, [
        element("div", { class: "semi-form-field", "data-required": "true" }, [
          element("span", { class: "semi-form-field-label-text" }, [text("家乡")]),
          nest(element("button", { role: "combobox" }), 12),
          element("input", { type: "hidden", name: "basic_info.hometown_city" })
        ])
      ]),
      field("resumeEditForm-education", "education_list[0].start_end_time", "起止时间", element("button", { role: "combobox" }, [
        text("2024-09 - 2026-06")
      ]), true),
      element("section", { class: "resumeEditForm-internship" }, [element("h2", {}, [text("实习经历")])]),
      element("div", { class: "unknown-collapsed-shell" }, [element("div", {}, [element("span", {}, [text("作品")])])]),
      element("section", { class: "resumeEditForm-project" }, [element("h2", {}, [text("项目经历")])]),
      element("section", { class: "resumeEditForm-award" }, [element("h2", {}, [text("获奖")])]),
      element("div", { class: "unknown-collapsed-shell" }, [element("div", {}, [element("span", {}, [text("语言能力")])])]),
      element("section", { class: "resumeEditForm-self" }, [element("h2", {}, [text("自我评价")])]),
      element("button", { type: "button" }, [text("提交简历")])
    ])])]
  };
}

function metaappFailureShapeRoot(): CdpDomNode {
  backendNodeId = 1;
  const field = (label: string, control: CdpDomNode, required = false) => element("div", {
    class: `atsx-form-item${required ? " is-required" : ""}`
  }, [
    element("div", { class: "atsx-label-shell" }, [
      ...(required ? [element("span", { class: "required-mark" }, [text("*")])] : []),
      element("span", { class: "atsx-label-text" }, [text(label)])
    ]),
    element("div", { class: "field-wrapper" }, [control])
  ]);
  const group = (label: string, fields: CdpDomNode[]) => element("div", { class: "application-block" }, [
    element("div", { class: "heading-shell" }, [element("span", {}, [text(label)])]),
    element("div", { class: "field-list" }, fields)
  ]);
  return {
    backendNodeId: backendNodeId++,
    nodeType: 9,
    nodeName: "#document",
    frameId: "main-frame",
    children: [element("html", {}, [element("body", {}, [
      group("简历", [
        field("简历附件", element("input", { type: "file", accept: "application/pdf" }), true)
      ]),
      group("基本信息", [
        field("姓名", element("input", { type: "text", value: "synthetic-private-name" }), true),
        field("手机号码", element("input", { type: "tel", value: "13800138000" }), true),
        field("邮箱", element("input", { type: "email", value: "candidate@example.com" }), true),
        field("国籍（地区）", element("div", { role: "combobox", "aria-expanded": "false" }))
      ]),
      group("教育经历", [
        field("学校名称", element("input", { type: "text" })),
        field("学历", element("div", { role: "combobox", "aria-expanded": "false" })),
        field("专业", element("input", { type: "text" })),
        field("起止时间", element("input", { type: "text", value: "2024-09 - 2026-06" }))
      ]),
      group("实习经历", [
        field("公司名称", element("input", { type: "text" })),
        field("职位名称", element("input", { type: "text" })),
        field("起止时间", element("input", { type: "text", value: "2025-01 - 2025-06" })),
        field("描述", element("textarea"))
      ]),
      element("div", { role: "listbox" }, [
        element("div", { role: "option" }, [text("本科")]),
        element("div", { role: "option" }, [text("硕士")]),
        element("div", { role: "option" }, [text("中国")])
      ]),
      element("button", { type: "button" }, [text("提交简历")])
    ])])]
  };
}

const session: PowerSessionView = {
  status: "active",
  sessionId: "power_test_session",
  tabId: 42,
  origin: "https://jobs.example",
  path: "/apply/1"
};

describe("privacy-safe page state", () => {
  it("extracts allowlisted semantics across main, open-shadow, and frame boundaries", () => {
    const state = buildPrivacySafePageState(
      fixtureRoot(),
      session,
      new OpaqueReferenceRegistry(() => "fixednonce")
    );

    expect(state.controls.map((control) => control.semantics.label)).toEqual([
      "毕业院校",
      "项目描述",
      "请输入联系电话",
      "期望工作城市",
      "最高学历",
      "accountPassword",
      "提交申请",
      "作品集链接",
      "推荐人姓名"
    ]);
    expect(state.summary).toEqual({
      controlCount: 9,
      frameCount: 2,
      openShadowRootCount: 1,
      blockedControlCount: 2,
      sectionCount: 0
    });
    expect(state.sections).toEqual([]);
    expect(state.controls.find((control) => control.semantics.label === "最高学历")?.options).toEqual(["本科", "硕士"]);
    expect(state.controls.find((control) => control.semantics.label === "请输入联系电话")?.inputType).toBe("text");
    expect(state.controls.find((control) => control.semantics.label === "作品集链接")?.boundary).toBe("open-shadow");
    expect(state.controls.find((control) => control.semantics.label === "推荐人姓名")?.boundary).toBe("same-origin-frame");
    expect(state.controls.find((control) => control.semantics.label === "accountPassword")?.safety).toBe("credential");
    expect(state.controls.find((control) => control.semantics.label === "提交申请")?.safety).toBe("final-submit");

    const serialized = JSON.stringify(state);
    expect(serialized).not.toMatch(/绝不能返回|13800138000|secret-password|private\.example|隐私姓名|private-class|private-bachelor|private-type-secret/i);
    expect(serialized).not.toMatch(/backendNodeId|nodeId|selector|className|"id"|"value"/);
  });

  it("keeps opaque references stable for unchanged backend nodes", () => {
    const root = fixtureRoot();
    const registry = new OpaqueReferenceRegistry(() => "stable123");
    const first = buildPrivacySafePageState(root, session, registry);
    root.nodeId = 9999;
    const second = buildPrivacySafePageState(root, session, registry);

    const firstRefs = new Map(first.controls.map((control) => [control.semantics.label, control.ref]));
    const secondRefs = new Map(second.controls.map((control) => [control.semantics.label, control.ref]));
    expect(secondRefs).toEqual(firstRefs);
    expect(first.snapshotId).not.toBe(second.snapshotId);
    expect([...firstRefs.values()]).toEqual(expect.arrayContaining([
      expect.stringMatching(/^node_stable123_[a-z0-9]{4}$/)
    ]));
  });

  it("finds controls semantically without accepting a selector", () => {
    const state = buildPrivacySafePageState(
      fixtureRoot(),
      session,
      new OpaqueReferenceRegistry(() => "findnonce")
    );
    const school = findPageControls(state, { text: "院校", roles: ["textbox"], limit: 3 });
    expect(school.matches[0]).toEqual(expect.objectContaining({
      label: "毕业院校",
      role: "textbox",
      score: 0.92,
      safety: "ordinary"
    }));
    expect(school.matches[0]?.reasons).toContain("字段标签");

    const degree = findPageControls(state, { text: "硕士" });
    expect(degree.matches[0]).toEqual(expect.objectContaining({ label: "最高学历", role: "combobox" }));
    expect(degree.matches[0]?.reasons).toContain("选项文字");
  });

  it("recovers Xiaomi section and field metadata while removing upload and date display values", () => {
    const state = buildPrivacySafePageState(
      xiaomiFailureShapeRoot(),
      { ...session, origin: "https://xiaomi.jobs.f.mioffice.cn", path: "/internship/resume/123/apply" },
      new OpaqueReferenceRegistry(() => "xiaominonce")
    );

    expect(state.sections).toEqual([
      "简历",
      "基本信息",
      "教育经历",
      "实习经历",
      "作品",
      "项目经历",
      "获奖",
      "语言能力",
      "自我评价"
    ]);
    expect(state.summary.sectionCount).toBe(9);
    expect(state.controls.find((control) => control.semantics.name === "basic_info.hometown_city")).toMatchObject({
      role: "combobox",
      required: true,
      semantics: { label: "家乡", section: "基本信息" }
    });
    expect(state.controls.find((control) => control.semantics.name === "education_list[0].start_end_time")).toMatchObject({
      role: "combobox",
      required: true,
      semantics: { label: "起止时间", section: "教育经历" }
    });
    expect(state.controls.find((control) => control.semantics.label === "提交简历")?.safety).toBe("final-submit");
    const serialized = JSON.stringify(state);
    expect(serialized).not.toContain("synthetic-candidate-private.pdf");
    expect(serialized).not.toContain("2026-08-07 10:30");
    expect(serialized).not.toContain("2024-09 - 2026-06");
    expect(serialized).not.toContain("上次上传");
  });

  it("recovers MetaApp nested labels, sections, date ranges, and required markers without reading values", () => {
    const state = buildPrivacySafePageState(
      metaappFailureShapeRoot(),
      { ...session, origin: "https://meta.jobs.feishu.cn", path: "/140297/resume/123/apply" },
      new OpaqueReferenceRegistry(() => "metaappnonce")
    );

    expect(state.sections).toEqual(["简历", "基本信息", "教育经历", "实习经历"]);
    const expected = [
      ["简历", "简历附件", true],
      ["基本信息", "姓名", true],
      ["基本信息", "手机号码", true],
      ["基本信息", "邮箱", true],
      ["基本信息", "国籍（地区）", false],
      ["教育经历", "学校名称", false],
      ["教育经历", "学历", false],
      ["教育经历", "专业", false],
      ["教育经历", "起止时间", false],
      ["实习经历", "公司名称", false],
      ["实习经历", "职位名称", false],
      ["实习经历", "起止时间", false],
      ["实习经历", "描述", false]
    ] as const;
    for (const [section, label, required] of expected) {
      expect(state.controls.some((control) =>
        control.semantics.section === section
        && control.semantics.label === label
        && control.required === required
      ), `${section} / ${label}`).toBe(true);
    }
    expect(state.controls.filter((control) => control.role === "option")).toHaveLength(3);
    expect(state.controls.find((control) => control.semantics.label === "提交简历")?.safety).toBe("final-submit");
    const serialized = JSON.stringify(state);
    expect(serialized).not.toMatch(/synthetic-private-name|13800138000|candidate@example\.com|2024-09|2025-01/);
  });
});
