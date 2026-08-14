export interface SavedResumeMetadata {
  fileName: string;
  size: number;
  sha256: string;
  savedAt: string;
}

export interface SavedResumeRepositoryLike {
  load(): Promise<SavedResumeMetadata | null>;
  save(file: File): Promise<SavedResumeMetadata>;
  clear(): Promise<void>;
}

export class SavedResumeRepository implements SavedResumeRepositoryLike {
  async load(): Promise<null> { return null; }
  async save(): Promise<SavedResumeMetadata> { throw new Error("Attachment persistence is unavailable in the local host."); }
  async clear(): Promise<void> {}
}
