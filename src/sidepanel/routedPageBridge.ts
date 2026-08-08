import type { CandidateProfile } from "../domain/profile";
import type { FillResult, FillSelection, ScanResult } from "../content/engine";
import type { RepeatableCreateResult, RepeatableGroupKey } from "../content/repeatableRecords";
import type { ResumeAttachmentCandidate, ResumeAttachmentResult } from "../content/resumeAttachment";
import type { SavedFieldMapping } from "../mapping/types";
import type { PageBridge } from "./pageBridge";

export type ActivePageUrlProvider = () => Promise<string>;
export type PageBridgeRoutePredicate = (url: string) => boolean;

/**
 * Transitional production router. A URL selected for K5 never falls back to
 * the legacy engine when its adapter scan fails; this preserves fail-closed
 * semantics while non-migrated ATS families keep their existing behavior.
 */
export class RoutedPageBridge implements PageBridge {
  private active: PageBridge | null = null;

  constructor(
    private readonly primary: PageBridge,
    private readonly fallback: PageBridge,
    private readonly activePageUrl: ActivePageUrlProvider,
    private readonly usePrimary: PageBridgeRoutePredicate
  ) {}

  private requireActive(): PageBridge {
    if (!this.active) throw new Error("page-bridge-route-missing-rescan-required");
    return this.active;
  }

  async scan(profile: CandidateProfile, mappings: SavedFieldMapping[] = []): Promise<ScanResult> {
    this.active = null;
    const selected = this.usePrimary(await this.activePageUrl()) ? this.primary : this.fallback;
    const result = await selected.scan(profile, mappings);
    this.active = selected;
    return result;
  }

  async fill(
    profile: CandidateProfile,
    selections: FillSelection[],
    mappings: SavedFieldMapping[] = []
  ): Promise<FillResult> {
    return this.requireActive().fill(profile, selections, mappings);
  }

  async createRepeatableRecords(
    profile: CandidateProfile,
    group: RepeatableGroupKey
  ): Promise<RepeatableCreateResult> {
    const active = this.requireActive();
    const operation = active.createRepeatableRecords;
    if (!operation) throw new Error("page-bridge-repeatable-unsupported");
    return operation.call(active, profile, group);
  }

  async attachResume(
    file: File,
    candidate: ResumeAttachmentCandidate,
    sha256: string,
    approvedAt: number
  ): Promise<ResumeAttachmentResult> {
    const active = this.requireActive();
    const operation = active.attachResume;
    if (!operation) throw new Error("page-bridge-resume-unsupported");
    return operation.call(active, file, candidate, sha256, approvedAt);
  }
}
