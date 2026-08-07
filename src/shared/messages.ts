import type { CandidateProfile } from "../domain/profile";
import type { FillResult, FillSelection, ScanResult } from "../content/engine";
import type { RepeatableCreateResult, RepeatableGroupKey } from "../content/repeatableRecords";
import type {
  ResumeAttachmentAuthorization,
  ResumeAttachmentMetadata,
  ResumeAttachmentPayload,
  ResumeAttachmentRejection,
  ResumeAttachmentResult
} from "../content/resumeAttachment";
import type { SavedFieldMapping } from "../mapping/types";
import type {
  FocusedRecoveryTargetResult,
  FocusedRecoveryWriteRequest,
  FocusedRecoveryWriteResult
} from "../content/focusedRecovery";

export type ContentRequest =
  | { type: "PING_CONTENT" }
  | { type: "SCAN_PAGE"; profile: CandidateProfile; mappings: SavedFieldMapping[] }
  | { type: "CREATE_REPEATABLE_RECORDS"; profile: CandidateProfile; group: RepeatableGroupKey }
  | { type: "AUTHORIZE_RESUME_ATTACHMENT"; metadata: ResumeAttachmentMetadata }
  | { type: "ATTACH_RESUME_FILE"; payload: ResumeAttachmentPayload }
  | { type: "GET_FOCUSED_RECOVERY_TARGET" }
  | { type: "FILL_FOCUSED_RECOVERY"; request: FocusedRecoveryWriteRequest }
  | { type: "FILL_PAGE"; profile: CandidateProfile; selections: FillSelection[]; mappings: SavedFieldMapping[] };

export type ContentResponse =
  | { ready: true }
  | { ok: true; result: ScanResult }
  | { ok: true; result: RepeatableCreateResult }
  | { ok: true; result: ResumeAttachmentAuthorization | ResumeAttachmentRejection }
  | { ok: true; result: ResumeAttachmentResult }
  | { ok: true; result: FocusedRecoveryTargetResult }
  | { ok: true; result: FocusedRecoveryWriteResult }
  | { ok: true; result: FillResult }
  | { ok: false; error: string };
