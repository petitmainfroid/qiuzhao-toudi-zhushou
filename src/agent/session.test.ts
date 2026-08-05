import { describe, expect, it } from "vitest";
import { AGENT_PROTOCOL_VERSION, type AgentCommandEnvelope } from "./protocol";
import {
  AgentSessionError,
  AgentSessionGuard,
  createAgentCapability
} from "./session";

const capability = "a".repeat(64);
const pageUrl = "https://xiaomi.jobs.f.mioffice.cn/internship/resume/7663053400020879658/apply";

function envelope(overrides: Partial<AgentCommandEnvelope> = {}): AgentCommandEnvelope {
  return {
    protocolVersion: AGENT_PROTOCOL_VERSION,
    capability,
    requestId: "request_001",
    tabId: 42,
    pageUrl,
    ...overrides
  };
}

function session(now = 1_000): AgentSessionGuard {
  return new AgentSessionGuard({
    capability,
    tabId: 42,
    pageUrl,
    now,
    createdByUserGesture: true
  });
}

function expectCode(run: () => unknown, code: AgentSessionError["code"]): void {
  try {
    run();
    throw new Error("Expected AgentSessionError");
  }
  catch (error) {
    expect(error).toBeInstanceOf(AgentSessionError);
    expect((error as AgentSessionError).code).toBe(code);
  }
}

describe("AgentSessionGuard", () => {
  it("requires an explicit user gesture and a secure exact page", () => {
    expectCode(
      () => new AgentSessionGuard({
        capability,
        tabId: 42,
        pageUrl,
        now: 1_000,
        createdByUserGesture: false
      }),
      "USER_GESTURE_REQUIRED"
    );
    expectCode(
      () => new AgentSessionGuard({
        capability,
        tabId: 42,
        pageUrl: "http://xiaomi.jobs.f.mioffice.cn/apply",
        now: 1_000,
        createdByUserGesture: true
      }),
      "INSECURE_PAGE"
    );
  });

  it("binds requests to the capability, tab, exact URL, lifetime, and request id", () => {
    const guard = session();
    guard.authorize(envelope(), 1_001);

    expectCode(() => guard.authorize(envelope(), 1_002), "REPLAYED_REQUEST");
    expectCode(
      () => guard.authorize(envelope({ requestId: "request_002", tabId: 7 }), 1_002),
      "WRONG_TAB"
    );
    expectCode(
      () => guard.authorize(envelope({
        requestId: "request_003",
        pageUrl: "https://xiaomi.jobs.f.mioffice.cn/internship/jobs/123"
      }), 1_002),
      "WRONG_PAGE"
    );
    expectCode(
      () => guard.authorize(envelope({ requestId: "request_004" }), 601_000),
      "SESSION_EXPIRED"
    );
  });

  it("allows only an exact, current, one-time user-approved fill selection", () => {
    const guard = session();
    guard.recordScan("scan_0001", ["field_name", "field_school"]);
    guard.approveFill({
      approvalId: "approval_001",
      scanId: "scan_0001",
      suggestionIds: ["field_school"],
      now: 2_000,
      approvedByUserGesture: true
    });

    expectCode(
      () => guard.consumeFill({
        approvalId: "approval_001",
        scanId: "scan_0001",
        suggestionIds: ["field_name", "field_school"],
        now: 2_001
      }),
      "APPROVAL_MISMATCH"
    );

    guard.consumeFill({
      approvalId: "approval_001",
      scanId: "scan_0001",
      suggestionIds: ["field_school"],
      now: 2_002
    });
    expectCode(
      () => guard.consumeFill({
        approvalId: "approval_001",
        scanId: "scan_0001",
        suggestionIds: ["field_school"],
        now: 2_003
      }),
      "APPROVAL_REQUIRED"
    );
  });

  it("invalidates approval after a new scan, expiry, or revocation", () => {
    const guard = session();
    guard.recordScan("scan_0001", ["field_name"]);
    guard.approveFill({
      approvalId: "approval_001",
      scanId: "scan_0001",
      suggestionIds: ["field_name"],
      now: 2_000,
      approvedByUserGesture: true,
      ttlMs: 100
    });
    expectCode(
      () => guard.consumeFill({
        approvalId: "approval_001",
        scanId: "scan_0001",
        suggestionIds: ["field_name"],
        now: 2_100
      }),
      "APPROVAL_EXPIRED"
    );

    guard.recordScan("scan_0002", ["field_school"]);
    expectCode(
      () => guard.consumeFill({
        approvalId: "approval_001",
        scanId: "scan_0001",
        suggestionIds: ["field_name"],
        now: 2_101
      }),
      "APPROVAL_REQUIRED"
    );

    guard.revoke();
    expectCode(
      () => guard.authorize(envelope({ requestId: "request_099" }), 2_102),
      "REVOKED"
    );
  });

  it("creates a 256-bit opaque capability without profile or page data", () => {
    const token = createAgentCapability();
    expect(token).toMatch(/^[a-f0-9]{64}$/);
    expect(token).not.toContain("xiaomi");
  });
});
