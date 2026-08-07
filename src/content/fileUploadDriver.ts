import type { PageUploadFailureReason } from "../bridge/protocol";

export interface FixedFileUploadPayload {
  base64: string;
  name: string;
  mimeType: "application/pdf";
  size: number;
}

export interface FixedFileUploadOutcome {
  performed: boolean;
  verified: boolean;
  reason?: PageUploadFailureReason;
}

/**
 * Self-contained fixed page-world upload executor. The caller can provide PDF
 * bytes and private metadata, but never a selector, script, filesystem path or
 * CDP method. The function body is the only code accepted by Runtime.callFunctionOn.
 */
export function runFixedFileUpload(this: Element, payload: FixedFileUploadPayload): FixedFileUploadOutcome {
  const element = this;
  const ownerWindow = element.ownerDocument?.defaultView;
  const fail = (reason: PageUploadFailureReason, performed = false): FixedFileUploadOutcome => ({
    performed,
    verified: false,
    reason
  });
  if (!ownerWindow || !element.isConnected) return fail("stale-reference");
  if (!(element instanceof ownerWindow.HTMLInputElement) || element.type.toLowerCase() !== "file") {
    return fail("blocked-control");
  }
  if (
    element.disabled
    || element.readOnly
    || element.multiple
    || element.closest("[hidden], [aria-hidden='true'], [inert]")
  ) return fail("blocked-control");
  const style = ownerWindow.getComputedStyle?.(element);
  if (style && (style.display === "none" || style.visibility === "hidden")) {
    return fail("blocked-control");
  }
  if (element.files?.length) return fail("blocked-control");
  if (
    payload.mimeType !== "application/pdf"
    || !Number.isSafeInteger(payload.size)
    || payload.size <= 0
    || payload.name.length < 1
    || payload.name.length > 180
    || !payload.name.toLowerCase().endsWith(".pdf")
    || /[\\/\0]/.test(payload.name)
  ) return fail("invalid-resume");

  try {
    const binary = ownerWindow.atob(payload.base64);
    if (binary.length !== payload.size) return fail("invalid-resume");
    const bytes = new ownerWindow.Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
    if (
      bytes.length < 5
      || bytes[0] !== 0x25
      || bytes[1] !== 0x50
      || bytes[2] !== 0x44
      || bytes[3] !== 0x46
      || bytes[4] !== 0x2d
    ) {
      bytes.fill(0);
      return fail("invalid-resume");
    }
    const file = new ownerWindow.File([bytes], payload.name, { type: payload.mimeType, lastModified: 0 });
    bytes.fill(0);
    const transfer = new ownerWindow.DataTransfer();
    transfer.items.add(file);
    element.files = transfer.files;
    element.dispatchEvent(new ownerWindow.Event("input", { bubbles: true }));
    element.dispatchEvent(new ownerWindow.Event("change", { bubbles: true }));
    const attached = element.files?.[0];
    const verified = element.files?.length === 1
      && attached?.name === payload.name
      && attached.size === payload.size
      && attached.type === payload.mimeType;
    return verified
      ? { performed: true, verified: true }
      : fail("verification-failed", true);
  }
  catch {
    return fail("verification-failed");
  }
}
