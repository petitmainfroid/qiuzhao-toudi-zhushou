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
          documentURL: "https://jobs.example/embedded/apply",
          children: [element("input", { "aria-label": "推荐人姓名", value: "隐私姓名" })]
        }
      }
    ])])]
  };
  return root;
}

const session: PowerSessionView = {
  status: "active",
  sessionId: "power_test_session",
  tabId: 42,
  origin: "https://jobs.example",
  path: "/apply/1"
};

describe("privacy-safe page state", () => {
  it("inherits allowlisted Feishu field metadata and redacts uploaded-file metadata", () => {
    backendNodeId = 1;
    const root: CdpDomNode = {
      backendNodeId: backendNodeId++,
      nodeType: 9,
      nodeName: "#document",
      frameId: "main-frame",
      children: [element("html", {}, [element("body", {}, [
        element("div", {
          "data-form-field-name": "education_list[1].school",
          "data-form-field-i18n-name": "学校名称"
        }, [element("input")]),
        element("div", {
          "data-form-field-name": "private value 13800138000",
          "data-form-field-i18n-name": "企业自定义题"
        }, [element("input")]),
        element("button", { type: "button" }, [text("私密姓名.pdf 上次上传 : 2026-02-25 23:31 更新 删除")])
      ])])]
    };

    const state = buildPrivacySafePageState(root, session, new OpaqueReferenceRegistry(() => "feishunonce"));
    expect(state.controls[0]).toEqual(expect.objectContaining({
      semantics: expect.objectContaining({
        label: "学校名称",
        name: "education_list[1].school"
      })
    }));
    expect(state.controls[1]?.semantics).toEqual({ label: "企业自定义题" });
    expect(state.controls[2]?.semantics.label).toContain("[文件]");
    expect(state.controls[2]?.semantics.label).toContain("[时间]");
    expect(JSON.stringify(state)).not.toMatch(/私密姓名|2026-02-25|23:31|13800138000|private value/i);
  });

  it("emits one opaque composite reference for a two-input Feishu date range", () => {
    backendNodeId = 1;
    const root: CdpDomNode = {
      backendNodeId: backendNodeId++,
      nodeType: 9,
      nodeName: "#document",
      frameId: "main-frame",
      children: [element("html", {}, [element("body", {}, [
        element("div", {
          class: "atsx-date-picker-period",
          "data-form-field-name": "education_list[0].start_end_time",
          "data-form-field-i18n-name": "起止时间"
        }, [
          element("input", { type: "month", value: "2020-09" }),
          element("input", { type: "month", value: "2024-06" })
        ])
      ])])]
    };

    const registry = new OpaqueReferenceRegistry(() => "rangenonce");
    const state = buildPrivacySafePageState(root, session, registry);
    expect(state.controls).toHaveLength(1);
    expect(state.controls[0]).toEqual(expect.objectContaining({
      role: "textbox",
      tag: "custom",
      semantics: {
        label: "起止时间",
        name: "education_list[0].start_end_time"
      }
    }));
    expect(registry.resolve(session.sessionId!, state.snapshotId, state.controls[0]!.ref)).toEqual(
      expect.objectContaining({ tag: "custom", role: "textbox" })
    );
    expect(JSON.stringify(state)).not.toMatch(/2020-09|2024-06/);
  });

  it("associates portal options through aria-controls without returning option values", () => {
    backendNodeId = 1;
    const root: CdpDomNode = {
      backendNodeId: backendNodeId++,
      nodeType: 9,
      nodeName: "#document",
      frameId: "main-frame",
      children: [element("html", {}, [element("body", {}, [
        element("input", {
          role: "combobox",
          name: "candidate.preferred_city",
          "aria-label": "Preferred city",
          "aria-controls": "city-options",
          "aria-expanded": "true"
        }),
        element("div", { id: "city-options", role: "listbox" }, [
          element("div", { role: "option", "data-value": "private-code-1" }, [text("Beijing")]),
          element("div", { role: "option", "data-value": "private-code-2" }, [text("Shanghai")])
        ])
      ])])]
    };
    const state = buildPrivacySafePageState(root, session, new OpaqueReferenceRegistry(() => "portalnonce"));
    const combobox = state.controls.find((control) => control.semantics.name === "candidate.preferred_city");
    expect(combobox?.options).toEqual(["Beijing", "Shanghai"]);
    expect(JSON.stringify(state)).not.toContain("private-code");
  });

  it("does not treat wrapped textarea values or select options as label text", () => {
    backendNodeId = 1;
    const root: CdpDomNode = {
      backendNodeId: backendNodeId++,
      nodeType: 9,
      nodeName: "#document",
      frameId: "main-frame",
      children: [element("html", {}, [element("body", {}, [
        element("label", {}, [text("自我介绍"), element("textarea", {}, [text("绝不能进入标签的旧内容")])]),
        element("label", {}, [text("最高学历"), element("select", {}, [
          element("option", {}, [text("本科")]),
          element("option", {}, [text("硕士")])
        ])]),
        element("div", { contenteditable: "", "aria-label": "个人优势" })
      ])])]
    };

    const state = buildPrivacySafePageState(root, session, new OpaqueReferenceRegistry(() => "labelnonce"));
    expect(state.controls.map((control) => control.semantics.label)).toEqual(["自我介绍", "最高学历", "个人优势"]);
    expect(JSON.stringify(state)).not.toContain("绝不能进入标签的旧内容");
    expect(state.controls[1]?.options).toEqual(["本科", "硕士"]);
    expect(state.controls[2]?.tag).toBe("contenteditable");
  });

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
      blockedControlCount: 2
    });
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

    const firstRef = first.controls[0]!.ref;
    expect(registry.resolve(session.sessionId!, first.snapshotId, firstRef)).toBeNull();
    expect(registry.resolve(session.sessionId!, second.snapshotId, firstRef)).toEqual(expect.objectContaining({
      backendNodeId: expect.any(Number),
      fingerprint: expect.any(String),
      origin: session.origin,
      path: session.path
    }));
    expect(registry.resolve("other-session", second.snapshotId, firstRef)).toBeNull();
  });

  it("excludes unproven or cross-origin frames and classifies destructive, consent, and default submit controls", () => {
    backendNodeId = 1;
    const root: CdpDomNode = {
      backendNodeId: backendNodeId++,
      nodeType: 9,
      nodeName: "#document",
      frameId: "main-frame",
      children: [element("html", {}, [element("body", {}, [
        element("form", {}, [
          element("button", {}, [text("继续")]),
          element("button", { type: "reset" }, [text("清空")]),
          element("label", {}, [text("同意隐私条款"), element("input", { type: "checkbox" })]),
          element("input", { autocomplete: "one-time-code", "aria-label": "动态口令" })
        ]),
        {
          ...element("iframe"),
          contentDocument: {
            backendNodeId: backendNodeId++,
            nodeType: 9,
            nodeName: "#document",
            frameId: "unknown-frame",
            children: [element("input", { "aria-label": "未知来源" })]
          }
        },
        {
          ...element("iframe"),
          contentDocument: {
            backendNodeId: backendNodeId++,
            nodeType: 9,
            nodeName: "#document",
            frameId: "cross-frame",
            documentURL: "https://other.example/apply",
            children: [element("input", { "aria-label": "跨域字段" })]
          }
        }
      ])])]
    };

    const state = buildPrivacySafePageState(root, session, new OpaqueReferenceRegistry(() => "safetynonce"));
    const byLabel = new Map(state.controls.map((control) => [control.semantics.label, control.safety]));
    expect(byLabel.get("继续")).toBe("final-submit");
    expect(byLabel.get("清空")).toBe("destructive");
    expect(byLabel.get("同意隐私条款")).toBe("consent");
    expect(byLabel.get("动态口令")).toBe("verification");
    expect(state.controls.some((control) => control.semantics.label === "未知来源")).toBe(false);
    expect(state.controls.some((control) => control.semantics.label === "跨域字段")).toBe(false);
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
});
