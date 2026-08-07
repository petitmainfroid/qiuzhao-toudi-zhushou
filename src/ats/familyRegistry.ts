import {
  GENERIC_ATS_FAMILY_ID,
  GENERIC_ATS_FAMILY_VERSION,
  type AtsFamilyDetectionCandidate,
  type AtsFamilyDetectionContext,
  type AtsFamilyDetector,
  type AtsFamilyEvidence,
  type AtsFamilyIdentity
} from "./contracts";
import { AtsObservationError, sanitizeObservationText } from "./sanitize";

const DETECTOR_ID_PATTERN = /^[a-z][a-z0-9-]{1,47}$/;
const DETECTOR_VERSION_PATTERN = /^\d+(?:\.\d+){0,2}$/;
const EVIDENCE_KINDS = new Set(["origin", "path", "control-structure", "semantic-marker"]);

function validDetector(detector: AtsFamilyDetector): void {
  if (!DETECTOR_ID_PATTERN.test(detector.id) || detector.id === GENERIC_ATS_FAMILY_ID) {
    throw new AtsObservationError(`Invalid ATS family detector id: ${detector.id}`);
  }
  if (!DETECTOR_VERSION_PATTERN.test(detector.version)) {
    throw new AtsObservationError(`Invalid ATS family detector version: ${detector.version}`);
  }
}
function normalizeEvidence(evidence: AtsFamilyEvidence[]): AtsFamilyEvidence[] | null {
  if (!Array.isArray(evidence) || evidence.length < 1 || evidence.length > 5) return null;
  const normalized: AtsFamilyEvidence[] = [];
  for (const item of evidence) {
    if (!item || !EVIDENCE_KINDS.has(item.kind)) return null;
    const detail = sanitizeObservationText(item.detail, 80);
    if (!detail) return null;
    normalized.push({ kind: item.kind, detail });
  }
  return normalized;
}

function normalizeCandidate(candidate: AtsFamilyDetectionCandidate | null): AtsFamilyDetectionCandidate | null {
  if (!candidate || !Number.isFinite(candidate.confidence) || candidate.confidence < 0 || candidate.confidence > 1) {
    return null;
  }
  const evidence = normalizeEvidence(candidate.evidence);
  return evidence ? { confidence: Number(candidate.confidence.toFixed(3)), evidence } : null;
}

export class AtsFamilyRegistry {
  private readonly detectors = new Map<string, AtsFamilyDetector>();

  constructor(detectors: AtsFamilyDetector[] = [], private readonly minimumConfidence = 0.65) {
    if (!Number.isFinite(minimumConfidence) || minimumConfidence < 0 || minimumConfidence > 1) {
      throw new AtsObservationError("ATS family detection threshold must be between 0 and 1.");
    }
    detectors.forEach((detector) => this.register(detector));
  }

  register(detector: AtsFamilyDetector): void {
    validDetector(detector);
    if (this.detectors.has(detector.id)) {
      throw new AtsObservationError(`Duplicate ATS family detector id: ${detector.id}`);
    }
    this.detectors.set(detector.id, detector);
  }

  detect(context: AtsFamilyDetectionContext): AtsFamilyIdentity {
    const candidates: AtsFamilyIdentity[] = [];
    for (const detector of this.detectors.values()) {
      try {
        const candidate = normalizeCandidate(detector.detect(context));
        if (!candidate || candidate.confidence < this.minimumConfidence) continue;
        candidates.push({
          id: detector.id,
          version: detector.version,
          confidence: candidate.confidence,
          evidence: candidate.evidence
        });
      }
      catch {
        // A detector cannot make an unknown page unsafe or block generic fallback.
      }
    }
    candidates.sort((left, right) =>
      right.confidence - left.confidence
      || left.id.localeCompare(right.id)
      || left.version.localeCompare(right.version)
    );
    return candidates[0] ?? {
      id: GENERIC_ATS_FAMILY_ID,
      version: GENERIC_ATS_FAMILY_VERSION,
      confidence: 0,
      evidence: []
    };
  }
}
