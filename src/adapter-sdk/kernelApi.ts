import type {
  PageActionAuthorizationView,
  PageActionIntent,
  PageActionResult,
  PageFindQuery,
  PageFindResult,
  PageUploadAuthorizationView,
  PageUploadResult,
  PageWaitCondition,
  PageWaitResult,
  PrivacySafePageState
} from "../bridge/protocol";

export interface RecruitmentKernelActionRequest {
  requestId: string;
  authorizationId: string;
  sessionId: string;
  snapshotId: string;
  ref: string;
  intent: PageActionIntent;
}

export interface RecruitmentKernelWaitRequest {
  requestId: string;
  sessionId: string;
  condition: PageWaitCondition;
  timeoutMs: number;
  pollIntervalMs: number;
}

export interface RecruitmentKernelUploadRequest {
  requestId: string;
  authorizationId: string;
  sessionId: string;
  snapshotId: string;
  ref: string;
}

export interface RecruitmentKernelApi {
  state(sessionId: string): Promise<PrivacySafePageState>;
  find(sessionId: string, query: PageFindQuery): Promise<PageFindResult>;
  authorizeActions(sessionId: string): Promise<PageActionAuthorizationView>;
  action(request: RecruitmentKernelActionRequest): Promise<PageActionResult>;
  wait(request: RecruitmentKernelWaitRequest): Promise<PageWaitResult>;
  authorizeUpload(sessionId: string, snapshotId: string, ref: string): Promise<PageUploadAuthorizationView>;
  upload(request: RecruitmentKernelUploadRequest): Promise<PageUploadResult>;
}
