export type AtsCorpusImportStatus = "imported" | "duplicate" | "validated";

export interface AtsCorpusOperationOptions {
  projectRoot?: string;
  corpusRoot?: string;
  dryRun?: boolean;
}

export interface AtsCorpusImportResult {
  status: AtsCorpusImportStatus;
  family: string;
  pageType: string;
  digest: string;
  relativePath: string;
}

export interface AtsCorpusVerificationResult {
  sampleCount: number;
  totalBytes: number;
  families: string[];
}

export class AtsCorpusError extends Error {
  code: string;
}

export const ATS_CORPUS_SCHEMA_VERSION: number;
export const ATS_CORPUS_MAX_INPUT_BYTES: number;
export const ATS_CORPUS_MAX_FILES: number;
export const ATS_CORPUS_MAX_TOTAL_BYTES: number;

export function normalizeCorpusInput(value: unknown): Record<string, unknown>;
export function structuralDigest(sample: unknown): string;
export function validateCorpusSample(sample: unknown, options?: AtsCorpusOperationOptions): Promise<unknown>;
export function importAtsCorpusSample(inputPath: string, options?: AtsCorpusOperationOptions): Promise<AtsCorpusImportResult>;
export function verifyAtsCorpus(options?: AtsCorpusOperationOptions): Promise<AtsCorpusVerificationResult>;
