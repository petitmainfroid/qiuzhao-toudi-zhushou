import { describe, expect, it } from "vitest";
import { isEmbeddedBridgeRequest } from "./protocol";

describe("embedded bridge protocol validation", () => {
  it("accepts bounded semantic find requests", () => {
    expect(isEmbeddedBridgeRequest({
      type: "POWER_PAGE_FIND",
      requestId: "request_12345678",
      query: { text: "毕业院校", roles: ["textbox"], limit: 5 }
    })).toBe(true);
  });

  it("rejects empty, oversized, invalid-role, and unbounded find requests", () => {
    for (const query of [
      { text: "" },
      { text: "x".repeat(121) },
      { text: "姓名", roles: ["selector"] },
      { text: "姓名", limit: 200 }
    ]) {
      expect(isEmbeddedBridgeRequest({
        type: "POWER_PAGE_FIND",
        requestId: "request_12345678",
        query
      })).toBe(false);
    }
    expect(isEmbeddedBridgeRequest({
      type: "POWER_PAGE_FIND",
      requestId: "request_12345678",
      query: { text: "姓名", selector: "#private" }
    })).toBe(false);
  });

  it("accepts strict profile-backed actions and rejects arbitrary values or browser primitives", () => {
    const valid = {
      type: "POWER_PAGE_ACTION",
      requestId: "request_action_123",
      authorizationId: "action_auth_12345",
      sessionId: "power_session_12345",
      snapshotId: "state_snapshot_123",
      ref: "node_reference_123",
      intent: { kind: "fill", source: { kind: "profile", path: "education.2.school" } }
    };
    expect(isEmbeddedBridgeRequest(valid)).toBe(true);
    expect(isEmbeddedBridgeRequest({ ...valid, value: "private" })).toBe(false);
    expect(isEmbeddedBridgeRequest({ ...valid, selector: "#target" })).toBe(false);
    expect(isEmbeddedBridgeRequest({ ...valid, method: "Runtime.evaluate" })).toBe(false);
    expect(isEmbeddedBridgeRequest({
      ...valid,
      intent: { kind: "fill", source: { kind: "profile", path: "basic.__proto__.secret" } }
    })).toBe(false);
    expect(isEmbeddedBridgeRequest({
      ...valid,
      intent: { kind: "fill", source: { kind: "profile", path: "unknown.value" } }
    })).toBe(false);
  });

  it("accepts only bounded check/click intents and strict authorization requests", () => {
    expect(isEmbeddedBridgeRequest({
      type: "POWER_PAGE_ACTION_AUTHORIZE",
      requestId: "authorize_123456"
    })).toBe(true);
    expect(isEmbeddedBridgeRequest({
      type: "POWER_PAGE_ACTION_AUTHORIZE",
      requestId: "authorize_123456",
      expiresAt: 123
    })).toBe(false);

    const base = {
      type: "POWER_PAGE_ACTION",
      requestId: "request_action_456",
      authorizationId: "action_auth_67890",
      sessionId: "power_session_67890",
      snapshotId: "state_snapshot_456",
      ref: "node_reference_456"
    };
    expect(isEmbeddedBridgeRequest({ ...base, intent: { kind: "check", desired: "unchecked" } })).toBe(true);
    expect(isEmbeddedBridgeRequest({ ...base, intent: { kind: "click", purpose: "open-control" } })).toBe(true);
    expect(isEmbeddedBridgeRequest({ ...base, intent: { kind: "click", purpose: "submit" } })).toBe(false);
  });

  it("accepts only a canonical same-record profile date range and no raw range values", () => {
    const base = {
      type: "POWER_PAGE_ACTION",
      requestId: "request_range_12345",
      authorizationId: "action_auth_range_123",
      sessionId: "power_session_range_123",
      snapshotId: "state_snapshot_range_123",
      ref: "node_reference_range_123"
    };
    const validIntent = {
      kind: "fill-range",
      source: {
        kind: "profile-range",
        startPath: "education.2.startDate",
        endPath: "education.2.endDate"
      }
    };
    expect(isEmbeddedBridgeRequest({ ...base, intent: validIntent })).toBe(true);
    expect(isEmbeddedBridgeRequest({
      ...base,
      intent: {
        ...validIntent,
        source: { ...validIntent.source, endPath: "education.3.endDate" }
      }
    })).toBe(false);
    expect(isEmbeddedBridgeRequest({
      ...base,
      intent: {
        ...validIntent,
        source: { ...validIntent.source, start: "2024-09", end: "2027-06" }
      }
    })).toBe(false);
  });

  it("accepts only bounded semantic wait conditions", () => {
    const base = {
      type: "POWER_PAGE_WAIT",
      requestId: "request_wait_1234",
      sessionId: "power_session_1234",
      timeoutMs: 2_000,
      pollIntervalMs: 100
    };
    const conditions = [
      { kind: "find", query: { text: "school" }, minimumMatches: 1 },
      { kind: "control-state", query: { text: "city", roles: ["combobox"] }, state: "expanded", minimumMatches: 1 },
      { kind: "option-list", query: { text: "city" }, minimumOptions: 2, optionText: "Beijing" },
      { kind: "same-origin-navigation" },
      { kind: "dom-settle", quietMs: 250 }
    ];
    for (const condition of conditions) {
      expect(isEmbeddedBridgeRequest({ ...base, condition })).toBe(true);
    }
  });

  it("rejects wait requests that expose browser primitives or exceed fixed bounds", () => {
    const valid = {
      type: "POWER_PAGE_WAIT",
      requestId: "request_wait_5678",
      sessionId: "power_session_5678",
      condition: { kind: "find", query: { text: "name" }, minimumMatches: 1 },
      timeoutMs: 1_000,
      pollIntervalMs: 100
    };
    expect(isEmbeddedBridgeRequest({ ...valid, selector: "#name" })).toBe(false);
    expect(isEmbeddedBridgeRequest({ ...valid, script: "return document.body" })).toBe(false);
    expect(isEmbeddedBridgeRequest({ ...valid, timeoutMs: 60_000 })).toBe(false);
    expect(isEmbeddedBridgeRequest({ ...valid, pollIntervalMs: 10 })).toBe(false);
    expect(isEmbeddedBridgeRequest({
      ...valid,
      condition: { kind: "find", query: { text: "name", xpath: "//*" }, minimumMatches: 1 }
    })).toBe(false);
  });

  it("accepts only opaque saved-resume upload and ephemeral screenshot requests", () => {
    const authorize = {
      type: "POWER_PAGE_UPLOAD_AUTHORIZE",
      requestId: "upload_authorize_123",
      sessionId: "power_session_1234",
      snapshotId: "state_snapshot_123",
      ref: "node_reference_123"
    };
    expect(isEmbeddedBridgeRequest(authorize)).toBe(true);
    const upload = {
      type: "POWER_PAGE_UPLOAD",
      requestId: "upload_execute_1234",
      authorizationId: "upload_authorization_123",
      sessionId: "power_session_1234",
      snapshotId: "state_snapshot_123",
      ref: "node_reference_123"
    };
    expect(isEmbeddedBridgeRequest(upload)).toBe(true);
    expect(isEmbeddedBridgeRequest({
      type: "POWER_PAGE_SCREENSHOT",
      requestId: "screenshot_request_123",
      sessionId: "power_session_1234"
    })).toBe(true);
    expect(isEmbeddedBridgeRequest({ type: "POWER_EVIDENCE_LOGS", requestId: "evidence_logs_1234" })).toBe(true);

    for (const forbidden of [
      { path: "C:\\private\\resume.pdf" },
      { filename: "private.pdf" },
      { sha256: "a".repeat(64) },
      { base64: "JVBERi0=" },
      { selector: "input[type=file]" },
      { script: "document.querySelector('input')" },
      { method: "DOM.setFileInputFiles" }
    ]) {
      expect(isEmbeddedBridgeRequest({ ...upload, ...forbidden })).toBe(false);
    }
  });
});
