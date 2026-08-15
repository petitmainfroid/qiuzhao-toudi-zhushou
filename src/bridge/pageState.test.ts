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
