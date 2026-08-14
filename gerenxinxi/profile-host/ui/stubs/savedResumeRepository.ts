import type { CandidateProfile } from "../../../../shared/domain/profile";

export interface SavedResumeMetadata {
  name: string;
  mimeType: "application/pdf";
  size: number;
  sha256: string;
  savedAt: string;
}

export interface SavedResumeRepositoryLike {
  load(): Promise<SavedResumeMetadata | null>;
  save(file: File): Promise<SavedResumeMetadata>;
  clear(): Promise<void>;
  parseSaved?(): Promise<{
    profile: CandidateProfile;
    populatedPaths: string[];
    warnings: string[];
    pageCount: number;
    usedOcr: boolean;
    extractedCharacterCount: number;
  }>;
}

export class SavedResumeRepository implements SavedResumeRepositoryLike {
  async load(): Promise<null> { return null; }
  async save(): Promise<SavedResumeMetadata> { throw new Error("Attachment persistence is unavailable in the local host."); }
  async clear(): Promise<void> {}
}
