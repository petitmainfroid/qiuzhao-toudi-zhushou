import { describeControl, discoverFields, findControlByElementId } from "../matching/dom";
import { normalizeFieldText } from "../matching/normalize";

export const MAX_RESUME_ATTACHMENT_BYTES = 10 * 1024 * 1024;
export const RESUME_ATTACHMENT_AUTHORIZATION_MS = 60_000;

export interface ResumeAttachmentCandidate {
  elementId: string;
  fieldLabel: string;
  destinationOrigin: string;
  acceptsPdf: boolean;
}

export interface ResumeAttachmentScan {
  status: "ready" | "not-found" | "ambiguous" | "unsupported";
  candidate: ResumeAttachmentCandidate | null;
  candidateCount: number;
}

export interface ResumeAttachmentMetadata {
  elementId: string;
  destinationOrigin: string;
  filename: string;
  size: number;
  mimeType: string;
  sha256: string;
  approvedAt: number;
}

export interface ResumeAttachmentAuthorization {
  ok: true;
  token: string;
  expiresAt: number;
}

export interface ResumeAttachmentRejection {
  ok: false;
  reason:
    | "candidate-changed"
    | "existing-file"
    | "invalid-destination"
    | "invalid-digest"
    | "invalid-filename"
    | "invalid-mime"
    | "invalid-size"
    | "stale-confirmation";
}

export interface ResumeAttachmentPayload {
  token: string;
  base64: string;
}

export type ResumeAttachmentFailureReason = ResumeAttachmentRejection["reason"]
  | "authorization-expired"
  | "authorization-missing"
  | "digest-mismatch"
  | "invalid-payload"
  | "not-pdf"
  | "transfer-failed";

export interface ResumeAttachmentResult {
  status: "attached" | "rejected";
  reason?: ResumeAttachmentFailureReason;
}

interface StoredAuthorization extends ResumeAttachmentMetadata {
  expiresAt: number;
}

const authorizations = new Map<string, StoredAuthorization>();

function currentOrigin(): string {
  return typeof location !== "undefined" ? location.origin : "local";
}

export function isResumeAttachmentOriginAllowed(origin: string): boolean {
  try {
    const url = new URL(origin);
    if (url.protocol === "https:") return true;
    return url.protocol === "http:"
      && ["127.0.0.1", "localhost", "[::1]"].includes(url.hostname);
  }
  catch {
    return false;
  }
}

function isAllowedAttachmentOrigin(): boolean {
  return isResumeAttachmentOriginAllowed(currentOrigin());
}

function isResumeSignal(value: string): boolean {
  const normalized = normalizeFieldText(value);
  return normalized.includes("简历")
    || normalized.includes("个人履历")
    || /(?:^|[^a-z])(resume|cv)(?:[^a-z]|$)/i.test(value)
    || normalized.includes("curriculumvitae");
}

function isForbiddenAttachmentSignal(value: string): boolean {
  const normalized = normalizeFieldText(value);
  return [
    "身份证", "证件", "护照", "头像", "照片", "成绩单", "作品集", "推荐信", "资格证",
    "identity", "passport", "portrait", "photo", "transcript", "portfolio", "recommendation", "certificate"
  ].some((signal) => normalized.includes(normalizeFieldText(signal)));
}

function inputAcceptsPdf(input: HTMLInputElement): boolean {
  const accept = input.accept.trim().toLowerCase();
  if (!accept) return true;
  return accept.split(",").some((part) => {
    const token = part.trim();
    return token === ".pdf" || token === "application/pdf" || token === "application/x-pdf";
  });
}

function attachmentCandidates(root: ParentNode): ResumeAttachmentCandidate[] {
  if (!isAllowedAttachmentOrigin()) return [];
  return discoverFields(root).flatMap((descriptor) => {
    if (descriptor.kind !== "file" || descriptor.disabled || descriptor.readOnly) return [];
    const control = findControlByElementId(descriptor.elementId);
    if (!(control instanceof HTMLInputElement) || control.type !== "file" || control.multiple) return [];
    const evidence = [
      descriptor.label,
      descriptor.ariaLabel,
      descriptor.placeholder,
      descriptor.name,
      descriptor.domId,
      descriptor.contextText
    ].filter(Boolean).join(" ");
    if (!isResumeSignal(evidence) || isForbiddenAttachmentSignal(evidence) || !inputAcceptsPdf(control)) return [];
    return [{
      elementId: descriptor.elementId,
      fieldLabel: descriptor.label || descriptor.ariaLabel || descriptor.placeholder || "上传简历",
      destinationOrigin: currentOrigin(),
      acceptsPdf: true
    }];
  });
}

export function scanResumeAttachment(root: ParentNode = document): ResumeAttachmentScan {
  const fileControls = discoverFields(root).filter((descriptor) => descriptor.kind === "file");
  const candidates = attachmentCandidates(root);
  if (candidates.length === 1) {
    return { status: "ready", candidate: candidates[0], candidateCount: 1 };
  }
  if (candidates.length > 1) {
    return { status: "ambiguous", candidate: null, candidateCount: candidates.length };
  }
  return {
    status: fileControls.length > 0 ? "unsupported" : "not-found",
    candidate: null,
    candidateCount: 0
  };
}

function validFilename(filename: string): boolean {
  return filename.length > 0
    && filename.length <= 180
    && !/[\\/\0]/.test(filename)
    && filename.toLowerCase().endsWith(".pdf");
}

function randomToken(): string {
  const bytes = new Uint8Array(18);
  crypto.getRandomValues(bytes);
  return `resume-attachment-${Array.from(bytes, (value) => value.toString(16).padStart(2, "0")).join("")}`;
}

function purgeExpiredAuthorizations(now: number): void {
  for (const [token, authorization] of authorizations) {
    if (authorization.expiresAt < now) authorizations.delete(token);
  }
}

export function authorizeResumeAttachment(
  metadata: ResumeAttachmentMetadata
): ResumeAttachmentAuthorization | ResumeAttachmentRejection {
  const now = Date.now();
  purgeExpiredAuthorizations(now);
  if (!isAllowedAttachmentOrigin() || metadata.destinationOrigin !== currentOrigin()) {
    return { ok: false, reason: "invalid-destination" };
  }
  if (!validFilename(metadata.filename)) return { ok: false, reason: "invalid-filename" };
  if (metadata.mimeType.toLowerCase() !== "application/pdf") return { ok: false, reason: "invalid-mime" };
  if (!Number.isSafeInteger(metadata.size) || metadata.size <= 0 || metadata.size > MAX_RESUME_ATTACHMENT_BYTES) {
    return { ok: false, reason: "invalid-size" };
  }
  if (!/^[a-f0-9]{64}$/i.test(metadata.sha256)) return { ok: false, reason: "invalid-digest" };
  if (metadata.approvedAt > now + 5_000 || now - metadata.approvedAt > RESUME_ATTACHMENT_AUTHORIZATION_MS) {
    return { ok: false, reason: "stale-confirmation" };
  }

  const scan = scanResumeAttachment();
  if (scan.status !== "ready" || scan.candidate?.elementId !== metadata.elementId) {
    return { ok: false, reason: "candidate-changed" };
  }
  const input = findControlByElementId(metadata.elementId);
  if (!(input instanceof HTMLInputElement) || input.files?.length) return { ok: false, reason: "existing-file" };

  const token = randomToken();
  const expiresAt = metadata.approvedAt + RESUME_ATTACHMENT_AUTHORIZATION_MS;
  authorizations.set(token, { ...metadata, sha256: metadata.sha256.toLowerCase(), expiresAt });
  return { ok: true, token, expiresAt };
}

function decodePayload(base64: string, expectedSize: number): Uint8Array<ArrayBuffer> | null {
  const maximumLength = Math.ceil(expectedSize / 3) * 4 + 4;
  if (!base64 || base64.length > maximumLength || !/^[A-Za-z0-9+/]*={0,2}$/.test(base64)) return null;
  try {
    const binary = atob(base64);
    if (binary.length !== expectedSize) return null;
    const bytes: Uint8Array<ArrayBuffer> = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
    return bytes;
  }
  catch {
    return null;
  }
}

function isPdfSignature(bytes: Uint8Array): boolean {
  return bytes.length >= 5
    && bytes[0] === 0x25
    && bytes[1] === 0x50
    && bytes[2] === 0x44
    && bytes[3] === 0x46
    && bytes[4] === 0x2d;
}

function hexDigest(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer), (value) => value.toString(16).padStart(2, "0")).join("");
}

export async function attachAuthorizedResume(payload: ResumeAttachmentPayload): Promise<ResumeAttachmentResult> {
  const authorization = authorizations.get(payload.token);
  authorizations.delete(payload.token);
  if (!authorization) return { status: "rejected", reason: "authorization-missing" };
  if (Date.now() > authorization.expiresAt) return { status: "rejected", reason: "authorization-expired" };
  if (authorization.destinationOrigin !== currentOrigin()) return { status: "rejected", reason: "candidate-changed" };

  const scan = scanResumeAttachment();
  if (scan.status !== "ready" || scan.candidate?.elementId !== authorization.elementId) {
    return { status: "rejected", reason: "candidate-changed" };
  }
  const input = findControlByElementId(authorization.elementId);
  if (!(input instanceof HTMLInputElement) || input.files?.length) {
    return { status: "rejected", reason: "candidate-changed" };
  }

  const bytes = decodePayload(payload.base64, authorization.size);
  if (!bytes) return { status: "rejected", reason: "invalid-payload" };
  if (!isPdfSignature(bytes)) return { status: "rejected", reason: "not-pdf" };
  const digest = hexDigest(await crypto.subtle.digest("SHA-256", bytes.buffer));
  if (digest !== authorization.sha256) return { status: "rejected", reason: "digest-mismatch" };

  try {
    const file = new File([bytes.buffer], authorization.filename, { type: "application/pdf", lastModified: 0 });
    const transfer = new DataTransfer();
    transfer.items.add(file);
    input.files = transfer.files;
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
    const attached = input.files?.length === 1
      && input.files[0].name === authorization.filename
      && input.files[0].size === authorization.size
      && input.files[0].type === "application/pdf";
    return attached ? { status: "attached" } : { status: "rejected", reason: "transfer-failed" };
  }
  catch {
    return { status: "rejected", reason: "transfer-failed" };
  }
}
