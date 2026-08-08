import { describe, expect, it, vi } from "vitest";
import type { EmbeddedBridgeRequest, EmbeddedBridgeResponse, PowerSessionView } from "../bridge/protocol";
import {
  ChromeRecruitmentKernelApi,
  RecruitmentKernelApiError,
  type RecruitmentKernelTransport
} from ".";

const session: PowerSessionView = {
  status: "active",
  sessionId: "power_session_12345",
  tabId: 42,
  origin: "https://careers.example.test",
  path: "/apply",
  startedAt: 1,
  expiresAt: 999_999
};

function transportFor(operation: EmbeddedBridgeResponse) {
  const send = vi.fn(async (request: EmbeddedBridgeRequest): Promise<EmbeddedBridgeResponse> => {
    if (request.type === "POWER_SESSION_STATUS") return { ok: true, session };
    return operation;
  });
  return {
    transport: { send } satisfies RecruitmentKernelTransport,
    send
  };
}

describe("Chrome recruitment kernel API", () => {
  it("binds state and semantic find to the same pinned session", async () => {
    const state = {
      snapshotId: "state_snapshot_123",
      origin: session.origin!,
      path: session.path!,
      controls: [],
      summary: { controlCount: 0, frameCount: 0, openShadowRootCount: 0, blockedControlCount: 0 }
    };
    const stateTransport = transportFor({ ok: true, state });
    await expect(new ChromeRecruitmentKernelApi(stateTransport.transport).state(session.sessionId!)).resolves.toEqual(state);
    expect(stateTransport.send.mock.calls.map(([request]) => request.type)).toEqual([
      "POWER_SESSION_STATUS", "POWER_PAGE_STATE", "POWER_SESSION_STATUS"
    ]);

    const result = {
      snapshotId: state.snapshotId,
      query: "name",
      searchedControlCount: 1,
      matches: []
    };
    const findTransport = transportFor({ ok: true, result });
    await new ChromeRecruitmentKernelApi(findTransport.transport).find(session.sessionId!, {
      text: "name",
      roles: ["textbox"],
      limit: 5
    });
    expect(findTransport.send.mock.calls[1]![0]).toMatchObject({
      type: "POWER_PAGE_FIND",
      query: { text: "name", roles: ["textbox"], limit: 5 }
    });
  });

  it("routes action, wait, and upload without selectors or arbitrary values", async () => {
    const requests: EmbeddedBridgeRequest[] = [];
    const transport: RecruitmentKernelTransport = {
      async send(request) {
        requests.push(request);
        if (request.type === "POWER_SESSION_STATUS") return { ok: true, session };
        if (request.type === "POWER_PAGE_ACTION_AUTHORIZE") {
          return { ok: true, authorization: { authorizationId: "action_authorization_123", expiresAt: 9000 } };
        }
        if (request.type === "POWER_PAGE_ACTION") {
          return {
            ok: true,
            action: {
              requestId: request.requestId,
              ref: request.ref,
              action: request.intent.kind,
              status: "verified",
              strategy: "native-setter",
              attempts: 1,
              durationBucket: "lt-100ms"
            }
          };
        }
        if (request.type === "POWER_PAGE_WAIT") {
          return {
            ok: true,
            wait: {
              requestId: request.requestId,
              condition: request.condition.kind,
              status: "matched",
              polls: 1,
              durationBucket: "lt-100ms"
            }
          };
        }
        if (request.type === "POWER_PAGE_UPLOAD_AUTHORIZE") {
          return {
            ok: true,
            uploadAuthorization: {
              authorizationId: "upload_authorization_123",
              expiresAt: 9000,
              origin: session.origin!,
              ref: request.ref
            }
          };
        }
        if (request.type === "POWER_PAGE_UPLOAD") {
          return {
            ok: true,
            upload: {
              requestId: request.requestId,
              ref: request.ref,
              action: "upload-saved-resume",
              status: "verified",
              attempts: 1,
              durationBucket: "lt-100ms"
            }
          };
        }
        throw new Error(`Unexpected ${request.type}`);
      }
    };
    const api = new ChromeRecruitmentKernelApi(transport);
    await api.authorizeActions(session.sessionId!);
    await api.action({
      requestId: "action_request_1234",
      authorizationId: "action_authorization_123",
      sessionId: session.sessionId!,
      snapshotId: "state_snapshot_123",
      ref: "node_reference_123",
      intent: { kind: "fill", source: { kind: "profile", path: "basic.fullName" } }
    });
    await api.wait({
      requestId: "wait_request_123456",
      sessionId: session.sessionId!,
      condition: { kind: "find", query: { text: "school" }, minimumMatches: 1 },
      timeoutMs: 2_000,
      pollIntervalMs: 100
    });
    const uploadAuthorization = await api.authorizeUpload(
      session.sessionId!,
      "state_snapshot_123",
      "node_reference_file"
    );
    await api.upload({
      requestId: "upload_request_1234",
      authorizationId: uploadAuthorization.authorizationId,
      sessionId: session.sessionId!,
      snapshotId: "state_snapshot_123",
      ref: "node_reference_file"
    });

    const serialized = JSON.stringify(requests);
    for (const forbidden of ["selector", "xpath", "javascript", "Runtime.evaluate", "private-value"]) {
      expect(serialized).not.toContain(forbidden);
    }
  });

  it("fails before an operation when the active session does not match", async () => {
    const send = vi.fn(async (): Promise<EmbeddedBridgeResponse> => ({
      ok: true,
      session: { ...session, sessionId: "power_session_other" }
    }));
    const api = new ChromeRecruitmentKernelApi({ send });
    await expect(api.find(session.sessionId!, { text: "name" })).rejects.toEqual(
      expect.objectContaining<Partial<RecruitmentKernelApiError>>({ code: "session-mismatch" })
    );
    expect(send).toHaveBeenCalledTimes(1);
  });

  it("rejects a result if the pinned session changes during a read", async () => {
    let statusCalls = 0;
    const transport: RecruitmentKernelTransport = {
      async send(request) {
        if (request.type === "POWER_SESSION_STATUS") {
          statusCalls += 1;
          return {
            ok: true,
            session: statusCalls === 1 ? session : { ...session, sessionId: "power_session_replaced" }
          };
        }
        return {
          ok: true,
          state: {
            snapshotId: "state_snapshot_123",
            origin: session.origin!,
            path: session.path!,
            controls: [],
            summary: { controlCount: 0, frameCount: 0, openShadowRootCount: 0, blockedControlCount: 0 }
          }
        };
      }
    };
    await expect(new ChromeRecruitmentKernelApi(transport).state(session.sessionId!)).rejects.toEqual(
      expect.objectContaining<Partial<RecruitmentKernelApiError>>({ code: "session-mismatch" })
    );
  });
});
