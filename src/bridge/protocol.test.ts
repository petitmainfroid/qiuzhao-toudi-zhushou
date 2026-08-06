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
});
