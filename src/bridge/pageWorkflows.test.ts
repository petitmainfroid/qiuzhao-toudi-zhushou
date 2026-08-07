import { describe, expect, it, vi } from "vitest";
import { EmbeddedCdpError } from "./opencliCdp";
import { PageWorkflowService, type PageWaitRequest } from "./pageWorkflows";
import type { PowerSessionView, PrivacySafeControl, PrivacySafePageState } from "./protocol";

function control(overrides: Partial<PrivacySafeControl> = {}): PrivacySafeControl {
  return {
    ref: "node_reference_123",
    role: "textbox",
    tag: "input",
    semantics: { label: "Name" },
    disabled: false,
    readOnly: false,
    required: false,
    multiple: false,
    boundary: "main",
    safety: "ordinary",
    ...overrides
  };
}

function state(controls: PrivacySafeControl[], path = "/apply/1"): PrivacySafePageState {
  return {
    snapshotId: `state_snapshot_${path.replace(/\W/g, "") || "root"}`,
    origin: "https://jobs.example",
    path,
    controls,
    summary: {
      controlCount: controls.length,
      frameCount: 1,
      openShadowRootCount: 0,
      blockedControlCount: controls.filter((entry) => entry.safety !== "ordinary").length
    }
  };
}

function active(path = "/apply/1"): PowerSessionView {
  return {
    status: "active",
    sessionId: "power_session_1234",
    tabId: 42,
    origin: "https://jobs.example",
    path
  };
}

function request(condition: PageWaitRequest["condition"], overrides: Partial<PageWaitRequest> = {}): PageWaitRequest {
  return {
    type: "POWER_PAGE_WAIT",
    requestId: "request_wait_1234",
    sessionId: "power_session_1234",
    condition,
    timeoutMs: 500,
    pollIntervalMs: 50,
    ...overrides
  };
}

function harness(states: PrivacySafePageState[], sessions: PowerSessionView[] = [active()]) {
  let now = 0;
  let stateIndex = 0;
  let sessionIndex = 0;
  const read = vi.fn(async () => states[Math.min(stateIndex++, states.length - 1)]!);
  const session = vi.fn(async () => sessions[Math.min(sessionIndex++, sessions.length - 1)]!);
  return {
    read,
    session,
    service: new PageWorkflowService({
      pageStateService: { read },
      session,
      now: () => now,
      sleep: async (milliseconds) => { now += milliseconds; }
    })
  };
}

describe("PageWorkflowService", () => {
  it("refinds a semantic target after a dynamic render", async () => {
    const target = control();
    const test = harness([state([]), state([target])]);
    const result = await test.service.wait(request({
      kind: "find",
      query: { text: "Name", roles: ["textbox"] },
      minimumMatches: 1
    }));
    expect(result).toEqual(expect.objectContaining({ status: "matched", polls: 2 }));
    expect(result.result?.matches[0]).toEqual(expect.objectContaining({ ref: target.ref }));
  });

  it("waits for fixed control and option-list states without reading field values", async () => {
    const disabled = control({ disabled: true });
    const enabled = control({ disabled: false });
    const controlTest = harness([state([disabled]), state([enabled])]);
    const enabledResult = await controlTest.service.wait(request({
      kind: "control-state",
      query: { text: "Name" },
      state: "enabled",
      minimumMatches: 1
    }));
    expect(enabledResult.status).toBe("matched");

    const city = control({
      role: "combobox",
      tag: "select",
      semantics: { label: "City" },
      options: ["Shanghai", "Beijing"]
    });
    const optionTest = harness([state([city])]);
    const optionResult = await optionTest.service.wait(request({
      kind: "option-list",
      query: { text: "City", roles: ["combobox"] },
      minimumOptions: 2,
      optionText: "Beijing"
    }));
    expect(optionResult.status).toBe("matched");
    expect(JSON.stringify(optionResult)).not.toMatch(/fieldValue|password|cookie/i);
  });

  it("detects document or SPA path changes while preserving the same session", async () => {
    const test = harness([state([])], [active("/apply/1"), active("/apply/2")]);
    const result = await test.service.wait(request({ kind: "same-origin-navigation" }));
    expect(result).toEqual(expect.objectContaining({ status: "matched", path: "/apply/2", polls: 2 }));
  });

  it("requires a quiet structural window before declaring the DOM settled", async () => {
    const first = state([control()]);
    const second = state([control(), control({ ref: "node_reference_456", semantics: { label: "City" } })]);
    const test = harness([first, second, second, second]);
    const result = await test.service.wait(request({ kind: "dom-settle", quietMs: 100 }));
    expect(result).toEqual(expect.objectContaining({ status: "matched", polls: 4 }));
  });

  it("fails closed for timeout, session replacement, inactivity, and Origin changes", async () => {
    const timeout = harness([state([])]);
    expect(await timeout.service.wait(request(
      { kind: "find", query: { text: "Missing" }, minimumMatches: 1 },
      { timeoutMs: 100 }
    ))).toEqual(expect.objectContaining({ status: "timeout", reason: "timeout", polls: 3 }));

    const replaced = harness([state([])], [{ ...active(), sessionId: "power_session_other" }]);
    expect(await replaced.service.wait(request({ kind: "same-origin-navigation" })))
      .toEqual(expect.objectContaining({ status: "failed", reason: "invalid-session", polls: 0 }));

    const inactive = harness([state([])], [{ status: "inactive", reason: "expired" }]);
    expect(await inactive.service.wait(request({ kind: "same-origin-navigation" })))
      .toEqual(expect.objectContaining({ status: "failed", reason: "session-inactive" }));

    const changed = harness([state([])], [{ ...active(), status: "paused", reason: "origin-changed" }]);
    expect(await changed.service.wait(request({ kind: "same-origin-navigation" })))
      .toEqual(expect.objectContaining({ status: "failed", reason: "origin-changed" }));
  });

  it("maps debugger read failures to a typed privacy-safe result", async () => {
    const test = harness([state([])]);
    test.read.mockRejectedValueOnce(new EmbeddedCdpError("bridge-failed", "private diagnostic"));
    const result = await test.service.wait(request({
      kind: "find",
      query: { text: "Name" },
      minimumMatches: 1
    }));
    expect(result).toEqual(expect.objectContaining({ status: "failed", reason: "bridge-failed" }));
    expect(JSON.stringify(result)).not.toContain("private diagnostic");
  });
});
