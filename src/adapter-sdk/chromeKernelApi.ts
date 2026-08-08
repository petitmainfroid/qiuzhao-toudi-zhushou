import type {
  EmbeddedBridgeRequest,
  EmbeddedBridgeResponse,
  PageActionAuthorizationView,
  PageActionResult,
  PageFindResult,
  PageUploadAuthorizationView,
  PageUploadResult,
  PageWaitResult,
  PowerSessionView,
  PrivacySafePageState
} from "../bridge/protocol";
import type {
  RecruitmentKernelActionRequest,
  RecruitmentKernelApi,
  RecruitmentKernelUploadRequest,
  RecruitmentKernelWaitRequest
} from "./kernelApi";

export type RecruitmentKernelApiFailure =
  | "session-inactive"
  | "session-mismatch"
  | "bridge-failed"
  | "invalid-response";

export class RecruitmentKernelApiError extends Error {
  constructor(readonly code: RecruitmentKernelApiFailure) {
    super(code);
    this.name = "RecruitmentKernelApiError";
  }
}

export interface RecruitmentKernelTransport {
  send(request: EmbeddedBridgeRequest): Promise<EmbeddedBridgeResponse>;
}

function randomRequestId(): string {
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID().replaceAll("-", "");
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (value) => value.toString(16).padStart(2, "0")).join("");
}

function responseFailure(response: EmbeddedBridgeResponse): never {
  if (!response.ok) throw new RecruitmentKernelApiError("bridge-failed");
  throw new RecruitmentKernelApiError("invalid-response");
}

function sessionResponse(response: EmbeddedBridgeResponse): PowerSessionView {
  if (response.ok && "session" in response) return response.session;
  return responseFailure(response);
}

function stateResponse(response: EmbeddedBridgeResponse): PrivacySafePageState {
  if (response.ok && "state" in response) return response.state;
  return responseFailure(response);
}

function findResponse(response: EmbeddedBridgeResponse): PageFindResult {
  if (response.ok && "result" in response) return response.result;
  return responseFailure(response);
}

function actionAuthorizationResponse(response: EmbeddedBridgeResponse): PageActionAuthorizationView {
  if (response.ok && "authorization" in response) return response.authorization;
  return responseFailure(response);
}

function actionResponse(response: EmbeddedBridgeResponse): PageActionResult {
  if (response.ok && "action" in response) return response.action;
  return responseFailure(response);
}

function waitResponse(response: EmbeddedBridgeResponse): PageWaitResult {
  if (response.ok && "wait" in response) return response.wait;
  return responseFailure(response);
}

function uploadAuthorizationResponse(response: EmbeddedBridgeResponse): PageUploadAuthorizationView {
  if (response.ok && "uploadAuthorization" in response) return response.uploadAuthorization;
  return responseFailure(response);
}

function uploadResponse(response: EmbeddedBridgeResponse): PageUploadResult {
  if (response.ok && "upload" in response) return response.upload;
  return responseFailure(response);
}

export class ChromeRecruitmentKernelApi implements RecruitmentKernelApi {
  constructor(private readonly transport: RecruitmentKernelTransport = {
    send: (request) => chrome.runtime.sendMessage(request) as Promise<EmbeddedBridgeResponse>
  }) {}

  private async pinnedSession(sessionId: string): Promise<PowerSessionView & { sessionId: string }> {
    const session = sessionResponse(await this.transport.send({
      type: "POWER_SESSION_STATUS",
      requestId: randomRequestId()
    }));
    if (session.status !== "active" || !session.sessionId) {
      throw new RecruitmentKernelApiError("session-inactive");
    }
    if (session.sessionId !== sessionId) throw new RecruitmentKernelApiError("session-mismatch");
    return session as PowerSessionView & { sessionId: string };
  }

  private async withinPinnedSession<T>(sessionId: string, operation: () => Promise<T>): Promise<T> {
    await this.pinnedSession(sessionId);
    const result = await operation();
    await this.pinnedSession(sessionId);
    return result;
  }

  async state(sessionId: string): Promise<PrivacySafePageState> {
    return this.withinPinnedSession(sessionId, async () => stateResponse(await this.transport.send({
      type: "POWER_PAGE_STATE",
      requestId: randomRequestId()
    })));
  }

  async find(sessionId: string, query: Parameters<RecruitmentKernelApi["find"]>[1]): Promise<PageFindResult> {
    return this.withinPinnedSession(sessionId, async () => findResponse(await this.transport.send({
      type: "POWER_PAGE_FIND",
      requestId: randomRequestId(),
      query
    })));
  }

  async authorizeActions(sessionId: string): Promise<PageActionAuthorizationView> {
    return this.withinPinnedSession(sessionId, async () => actionAuthorizationResponse(await this.transport.send({
      type: "POWER_PAGE_ACTION_AUTHORIZE",
      requestId: randomRequestId()
    })));
  }

  async action(request: RecruitmentKernelActionRequest): Promise<PageActionResult> {
    return this.withinPinnedSession(request.sessionId, async () => actionResponse(await this.transport.send({
      type: "POWER_PAGE_ACTION",
      ...request
    })));
  }

  async wait(request: RecruitmentKernelWaitRequest): Promise<PageWaitResult> {
    return this.withinPinnedSession(request.sessionId, async () => waitResponse(await this.transport.send({
      type: "POWER_PAGE_WAIT",
      ...request
    })));
  }

  async authorizeUpload(
    sessionId: string,
    snapshotId: string,
    ref: string
  ): Promise<PageUploadAuthorizationView> {
    return this.withinPinnedSession(sessionId, async () => uploadAuthorizationResponse(await this.transport.send({
      type: "POWER_PAGE_UPLOAD_AUTHORIZE",
      requestId: randomRequestId(),
      sessionId,
      snapshotId,
      ref
    })));
  }

  async upload(request: RecruitmentKernelUploadRequest): Promise<PageUploadResult> {
    return this.withinPinnedSession(request.sessionId, async () => uploadResponse(await this.transport.send({
      type: "POWER_PAGE_UPLOAD",
      ...request
    })));
  }
}
