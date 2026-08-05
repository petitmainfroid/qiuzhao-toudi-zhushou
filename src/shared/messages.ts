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

export type ContentRequest =
  | { type: "PING_CONTENT" }
  | { type: "SCAN_PAGE"; profile: CandidateProfile; mappings: SavedFieldMapping[] }
  | { type: "CREATE_REPEATABLE_RECORDS"; profile: CandidateProfile; group: RepeatableGroupKey }
  | { type: "AUTHORIZE_RESUME_ATTACHMENT"; metadata: ResumeAttachmentMetadata }
  | { type: "ATTACH_RESUME_FILE"; payload: ResumeAttachmentPayload }
  | { type: "FILL_PAGE"; profile: CandidateProfile; selections: FillSelection[]; mappings: SavedFieldMapping[] };

export type ContentResponse =
  | { ready: true }
  | { ok: true; result: ScanResult }
  | { ok: true; result: RepeatableCreateResult }
  | { ok: true; result: ResumeAttachmentAuthorization | ResumeAttachmentRejection }
  | { ok: true; result: ResumeAttachmentResult }
  | { ok: true; result: FillResult }
  | { ok: false; error: string };
