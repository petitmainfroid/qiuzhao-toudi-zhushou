const EMAIL_PATTERN = /[\w.+-]+@[\w.-]+\.[a-z]{2,}/gi;
const EMAIL_DETECT_PATTERN = /^[\w.+-]+@[\w.-]+\.[a-z]{2,}$/i;
const PHONE_PATTERN = /(?:\+?86[-\s]?)?1[3-9]\d{9}|\b\d{3,4}[-\s]\d{7,8}\b/g;
const IDENTITY_PATTERN = /\b\d{17}[\dXx]\b/g;
const URL_PATTERN = /https?:\/\/[^\s]+/gi;
const WINDOWS_PATH_PATTERN = /\b[A-Za-z]:\\[^\s]+/g;
const POSIX_USER_PATH_PATTERN = /\/(?:Users|home)\/[^\s]+/g;
const BEARER_PATTERN = /\bBearer\s+[A-Za-z0-9._~-]+/gi;
const LONG_TOKEN_PATTERN = /\b[A-Za-z0-9_-]{28,}\b/g;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const PATH_TOKEN_PATTERN = /^[A-Za-z0-9_-]{16,}$/;
const FILE_METADATA_PATTERN = /(?:^|[\s\\/])[^\\/\s]{1,80}\.(?:pdf|docx?|pptx?|xlsx?|png|jpe?g|gif|html?|zip|rar)(?=$|[\s,，;；:：)）])/i;
const UPLOAD_STATUS_PATTERN = /上次上传|上传时间|更新于|last\s+uploaded|last\s+modified/i;
const TIMESTAMP_PATTERN = /\b(?:19|20)\d{2}[-/.]\d{1,2}[-/.]\d{1,2}(?:[ T]\d{1,2}:\d{2}(?::\d{2})?)?\b/;
const DATE_DISPLAY_PATTERN = /^(?:19|20)\d{2}\s*(?:[-/.年])\s*(?:0?[1-9]|1[0-2])(?:\s*月)?(?:\s*(?:[-~至])\s*(?:19|20)?\d{0,4}\s*(?:[-/.年])?\s*(?:0?[1-9]|1[0-2])(?:\s*月)?)?$/;

export class AtsObservationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AtsObservationError";
  }
}

export function sanitizeObservationText(value: string | undefined, maxLength = 120): string {
  if (!value) return "";
  return value
    .replace(URL_PATTERN, "[链接]")
    .replace(EMAIL_PATTERN, "[邮箱]")
    .replace(IDENTITY_PATTERN, "[身份信息]")
    .replace(PHONE_PATTERN, "[电话]")
    .replace(WINDOWS_PATH_PATTERN, "[本地路径]")
    .replace(POSIX_USER_PATH_PATTERN, "[本地路径]")
    .replace(BEARER_PATTERN, "[凭据]")
    .replace(LONG_TOKEN_PATTERN, "[长标识]")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
}

export function sanitizeObservationSemanticText(value: string | undefined, maxLength = 120): string {
  if (!value) return "";
  if (
    FILE_METADATA_PATTERN.test(value)
    || UPLOAD_STATUS_PATTERN.test(value)
    || TIMESTAMP_PATTERN.test(value)
    || DATE_DISPLAY_PATTERN.test(value.trim())
  ) return "";
  return sanitizeObservationText(value, maxLength);
}

export function sanitizeTechnicalName(value: string | undefined): string {
  return sanitizeObservationText(value, 80)
    .replace(UUID_PATTERN, "[uuid]")
    .replace(/\[\d+\]/g, "[]")
    .replace(/\d{3,}/g, "[n]")
    .replace(/[?#].*$/, "")
    .slice(0, 80);
}

export function normalizeHttpsOrigin(value: string): string {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.username || url.password || url.pathname !== "/" || url.search || url.hash) {
      throw new Error("unsafe");
    }
    return url.origin;
  }
  catch {
    throw new AtsObservationError("ATS observation requires a credential-free HTTPS Origin.");
  }
}

function templateSegment(segment: string): string {
  let decoded = segment;
  try {
    decoded = decodeURIComponent(segment);
  }
  catch {
    decoded = segment;
  }
  if (!decoded) return "";
  if (/^\d+$/.test(decoded)) return ":id";
  if (UUID_PATTERN.test(decoded)) return ":uuid";
  if (EMAIL_DETECT_PATTERN.test(decoded)) return ":email";
  if (PATH_TOKEN_PATTERN.test(decoded)) return ":token";
  return sanitizeObservationText(decoded, 48)
    .replace(/\d{4,}/g, ":id")
    .replace(/[?#]/g, "_")
    .replace(/[^\p{L}\p{N}._~:@-]+/gu, "-")
    .slice(0, 48);
}

export function templateObservationPath(value: string): string {
  if (!value.startsWith("/") || value.includes("?") || value.includes("#")) {
    throw new AtsObservationError("ATS observation path must be a query-free pathname.");
  }
  const segments = value.split("/").slice(0, 20).map(templateSegment);
  const templated = segments.join("/").replace(/\/{2,}/g, "/");
  return (templated || "/").slice(0, 240);
}

export function normalizeLanguage(value: string | undefined): string {
  const language = (value || "und").trim();
  return /^[A-Za-z]{2,3}(?:-[A-Za-z0-9]{2,8}){0,2}$/.test(language) ? language : "und";
}

export function normalizeToolVersion(value: string): string {
  const version = value.trim();
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,31}$/.test(version)) {
    throw new AtsObservationError("Invalid ATS observation tool version.");
  }
  return version;
}
