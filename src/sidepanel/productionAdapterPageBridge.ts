import type { CandidateProfile } from "../domain/profile";
import type { FillResult, FillSelection, ScanResult } from "../content/engine";
import type { RepeatableCreateResult, RepeatableGroupKey } from "../content/repeatableRecords";
import type { ResumeAttachmentCandidate, ResumeAttachmentResult } from "../content/resumeAttachment";
import type { SavedFieldMapping } from "../mapping/types";
import type { PageBridge } from "./pageBridge";

export type ActivePageUrlProvider = () => Promise<string>;
export type ProductionAdapterUrlPredicate = (url: string) => boolean;

/**
 * Production K5 gate. Unknown URLs never reach the adapter scanner and there
 * is deliberately no legacy content-script fallback. A successful scan pins
 * the adapter bridge for the later user-selected operations.
 */
export class ProductionAdapterPageBridge implements PageBridge {
  private active = false;

  constructor(
    private readonly adapter: PageBridge,
    private readonly activePageUrl: ActivePageUrlProvider,
    private readonly isSupportedUrl: ProductionAdapterUrlPredicate
  ) {}

  private requireActive(): void {
    if (!this.active) throw new Error("page-bridge-route-missing-rescan-required");
  }

  async scan(profile: CandidateProfile, mappings: SavedFieldMapping[] = []): Promise<ScanResult> {
    this.active = false;
    if (!this.isSupportedUrl(await this.activePageUrl())) {
      throw new Error("ats-adapter-url-unsupported");
    }
    const result = await this.adapter.scan(profile, mappings);
    this.active = true;
    return result;
  }

  async fill(
    profile: CandidateProfile,
    selections: FillSelection[],
    mappings: SavedFieldMapping[] = []
  ): Promise<FillResult> {
    this.requireActive();
    return this.adapter.fill(profile, selections, mappings);
  }

  async createRepeatableRecords(
    profile: CandidateProfile,
    group: RepeatableGroupKey
  ): Promise<RepeatableCreateResult> {
    this.requireActive();
    const operation = this.adapter.createRepeatableRecords;
    if (!operation) throw new Error("page-bridge-repeatable-unsupported");
    return operation.call(this.adapter, profile, group);
  }

  async attachResume(
    file: File,
    candidate: ResumeAttachmentCandidate,
    sha256: string,
    approvedAt: number
  ): Promise<ResumeAttachmentResult> {
    this.requireActive();
    const operation = this.adapter.attachResume;
    if (!operation) throw new Error("page-bridge-resume-unsupported");
    return operation.call(this.adapter, file, candidate, sha256, approvedAt);
  }
}
