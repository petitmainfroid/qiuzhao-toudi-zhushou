import type { CandidateProfile } from "../domain/profile";
import type { FillResult, FillSelection, ScanResult } from "../content/engine";
import type { RepeatableCreateResult, RepeatableGroupKey } from "../content/repeatableRecords";
import type { SavedFieldMapping } from "../mapping/types";

export type ContentRequest =
  | { type: "PING_CONTENT" }
  | { type: "SCAN_PAGE"; profile: CandidateProfile; mappings: SavedFieldMapping[] }
  | { type: "CREATE_REPEATABLE_RECORDS"; profile: CandidateProfile; group: RepeatableGroupKey }
  | { type: "FILL_PAGE"; profile: CandidateProfile; selections: FillSelection[]; mappings: SavedFieldMapping[] };

export type ContentResponse =
  | { ready: true }
  | { ok: true; result: ScanResult }
  | { ok: true; result: RepeatableCreateResult }
  | { ok: true; result: FillResult }
  | { ok: false; error: string };
