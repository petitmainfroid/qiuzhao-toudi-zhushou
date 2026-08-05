import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createEmptyProfile } from "../domain/profile";
import { AGENT_PROTOCOL_VERSION, type AgentCommandEnvelope } from "./protocol";
import { AgentBridgeController } from "./controller";
import { AgentSessionError, AgentSessionGuard } from "./session";

const capability = "b".repeat(64);
const pageUrl = "https://xiaomi.jobs.f.mioffice.cn/internship/resume/7663053400020879658/apply";

function envelope(requestId: string): AgentCommandEnvelope {
  return {
    protocolVersion: AGENT_PROTOCOL_VERSION,
    capability,
    requestId,
    tabId: 17,
    pageUrl
  };
}

function expectCode(error: unknown, code: AgentSessionError["code"]): void {
  expect(error).toBeInstanceOf(AgentSessionError);
  expect((error as AgentSessionError).code).toBe(code);
}

describe("AgentBridgeController", () => {
  beforeEach(() => {
    document.body.innerHTML = `
      <form id="application">
        <label>姓名<input id="full-name" name="name" /></label>
        <label>联系邮箱<input id="email" name="email" /></label>
        <label>验证码<input id="verification" name="verification_code" /></label>
        <button id="submit" type="submit">提交申请</button>
      </form>
    `;
  });

  afterEach(() => {
    document.body.innerHTML = "";
  });

  function setup() {
    const profile = createEmptyProfile();
    profile.basic.fullName = "只应在批准后写入";
    profile.basic.email = "approved@example.test";
    let now = 1_000;
    let id = 0;
    let currentUrl = pageUrl;
    const submit = vi.fn((event: Event) => event.preventDefault());
    document.getElementById("application")?.addEventListener("submit", submit);
    const guard = new AgentSessionGuard({
      capability,
      tabId: 17,
      pageUrl,
      now,
      createdByUserGesture: true
    });
    const controller = new AgentBridgeController({
      session: guard,
      profile,
      now: () => now,
      currentPageUrl: () => currentUrl,
      idFactory: () => `opaque_${String(++id).padStart(4, "0")}`
    });
    return {
      controller,
      submit,
      setNow(value: number) { now = value; },
      navigate(value: string) { currentUrl = value; }
    };
  }

  it("scans and previews without mutating fields or exposing profile values", async () => {
    const { controller, submit } = setup();
    const scan = await controller.handle({ ...envelope("request_001"), command: "scan" });
    expect(scan.command).toBe("scan");
    expect((document.getElementById("full-name") as HTMLInputElement).value).toBe("");
    expect((document.getElementById("email") as HTMLInputElement).value).toBe("");

    if (scan.command !== "scan") throw new Error("Expected scan result");
    const preview = await controller.handle({
      ...envelope("request_002"),
      command: "preview",
      scanId: scan.scanId
    });
    expect(preview.command).toBe("preview");
    expect(JSON.stringify(preview)).not.toContain("只应在批准后写入");
    expect(JSON.stringify(preview)).not.toContain("approved@example.test");
    expect(JSON.stringify(preview)).not.toContain("valuePreview");
    expect(submit).not.toHaveBeenCalled();
  });

  it("fills exactly the opaque suggestion IDs approved by a fresh user gesture", async () => {
    const { controller, submit } = setup();
    const scan = await controller.handle({ ...envelope("request_010"), command: "scan" });
    if (scan.command !== "scan") throw new Error("Expected scan result");
    const preview = await controller.handle({
      ...envelope("request_011"),
      command: "preview",
      scanId: scan.scanId
    });
    if (preview.command !== "preview") throw new Error("Expected preview result");
    const name = preview.preview.items.find((item) => item.profilePath === "basic.fullName");
    const email = preview.preview.items.find((item) => item.profilePath === "basic.email");
    expect(name).toBeDefined();
    expect(email).toBeDefined();

    const approvalId = controller.approveFill({
      scanId: scan.scanId,
      suggestionIds: [name!.suggestionId],
      approvedByUserGesture: true
    });
    const fill = await controller.handle({
      ...envelope("request_012"),
      command: "fill",
      scanId: scan.scanId,
      approvalId,
      suggestionIds: [name!.suggestionId]
    });
    expect(fill.command).toBe("fill");
    expect((document.getElementById("full-name") as HTMLInputElement).value).toBe("只应在批准后写入");
    expect((document.getElementById("email") as HTMLInputElement).value).toBe("");
    expect((document.getElementById("verification") as HTMLInputElement).value).toBe("");
    expect(submit).not.toHaveBeenCalled();
  });

  it("rejects an unapproved expansion, page navigation, and stale scans", async () => {
    const { controller, navigate } = setup();
    const first = await controller.handle({ ...envelope("request_020"), command: "scan" });
    if (first.command !== "scan") throw new Error("Expected scan result");
    const firstPreview = await controller.handle({
      ...envelope("request_021"),
      command: "preview",
      scanId: first.scanId
    });
    if (firstPreview.command !== "preview") throw new Error("Expected preview result");
    const fillable = firstPreview.preview.items.filter((item) => item.profilePath && !item.excludedReason);
    const approvalId = controller.approveFill({
      scanId: first.scanId,
      suggestionIds: [fillable[0].suggestionId],
      approvedByUserGesture: true
    });

    await expect(controller.handle({
      ...envelope("request_022"),
      command: "fill",
      scanId: first.scanId,
      approvalId,
      suggestionIds: fillable.map((item) => item.suggestionId)
    })).rejects.toSatisfy((error: unknown) => {
      expectCode(error, "APPROVAL_MISMATCH");
      return true;
    });

    const second = await controller.handle({ ...envelope("request_023"), command: "scan" });
    if (second.command !== "scan") throw new Error("Expected scan result");
    await expect(controller.handle({
      ...envelope("request_024"),
      command: "preview",
      scanId: first.scanId
    })).rejects.toSatisfy((error: unknown) => {
      expectCode(error, "SCAN_MISMATCH");
      return true;
    });

    navigate("https://xiaomi.jobs.f.mioffice.cn/internship/jobs/other");
    await expect(controller.handle({
      ...envelope("request_025"),
      command: "preview",
      scanId: second.scanId
    })).rejects.toSatisfy((error: unknown) => {
      expectCode(error, "WRONG_PAGE");
      return true;
    });
  });
});
