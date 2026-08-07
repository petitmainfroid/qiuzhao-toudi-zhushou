import { normalizeFieldText } from "../matching/normalize";
import type { AtsControlDriverHint, AtsTemplateVerification } from "../ats/templateContracts";
import type { PageControl, PageControlAdapter } from "./controlAdapters/contracts";
import {
  defaultPageControlAdapterRegistry,
  type PageControlAdapterRegistry
} from "./controlAdapters/registry";
import { bounded, controlUnavailable, waitUntil } from "./controlAdapters/shared";

export type { PageControl } from "./controlAdapters/contracts";

export type PageWriteFailureReason =
  | "detached"
  | "blocked-control"
  | "disabled-or-readonly"
  | "hidden-control"
  | "option-not-found"
  | "unsupported-control"
  | "verification-failed";

export interface VerifiedPageWrite {
  status: "verified" | "failed";
  attempts: number;
  reason?: PageWriteFailureReason;
}

export interface PageWriteOptions {
  normalize?: (value: string) => string;
  maxAttempts?: number;
  optionTimeoutMs?: number;
  verificationTimeoutMs?: number;
  adapterRegistry?: PageControlAdapterRegistry;
  driverHint?: AtsControlDriverHint;
  verification?: AtsTemplateVerification;
}

function verificationCompatible(
  verification: AtsTemplateVerification,
  adapter: PageControlAdapter,
  element: PageControl
): boolean {
  if (verification === "none") return false;
  if (verification === "normalized-equality") return true;
  if (verification === "selected-option") {
    return ["feishu-select", "ant-select", "element-select", "aria-combobox"].includes(adapter.id)
      || element instanceof HTMLSelectElement
      || (element instanceof HTMLInputElement && element.type === "radio");
  }
  return adapter.id === "native"
    && element instanceof HTMLInputElement
    && ["checkbox", "radio"].includes(element.type);
}

export function controlAdapterId(
  element: PageControl,
  registry: PageControlAdapterRegistry = defaultPageControlAdapterRegistry
): string | null {
  if (controlUnavailable(element)) return null;
  return registry.resolve(element)?.id ?? null;
}

export function readControlCandidates(
  element: PageControl,
  registry: PageControlAdapterRegistry = defaultPageControlAdapterRegistry
): string[] | null {
  if (controlUnavailable(element)) return null;
  return registry.resolve(element)?.read(element) ?? null;
}

export async function writeControlVerified(
  element: PageControl,
  value: string,
  options: PageWriteOptions = {}
): Promise<VerifiedPageWrite> {
  const unavailable = controlUnavailable(element);
  if (unavailable) return { status: "failed", attempts: 0, reason: unavailable };

  const registry = options.adapterRegistry ?? defaultPageControlAdapterRegistry;
  const adapter = registry.resolve(element, options.driverHint);
  if (!adapter) return { status: "failed", attempts: 0, reason: "unsupported-control" };
  const verification = options.verification ?? "normalized-equality";
  if (!verificationCompatible(verification, adapter, element)) {
    return { status: "failed", attempts: 0, reason: "unsupported-control" };
  }

  const normalize = options.normalize ?? normalizeFieldText;
  const maxAttempts = bounded(options.maxAttempts, 2, 1, 2);
  const context = {
    normalize,
    optionTimeoutMs: bounded(options.optionTimeoutMs, 900, 50, 2_000)
  };
  const verificationTimeoutMs = bounded(options.verificationTimeoutMs, 250, 25, 1_000);

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const currentUnavailable = controlUnavailable(element);
    if (currentUnavailable) {
      return { status: "failed", attempts: attempt - 1, reason: currentUnavailable };
    }
    const write = await adapter.write(element, value, context);
    if (write.status === "failed" && write.reason !== "verification-failed") {
      return { status: "failed", attempts: attempt, reason: write.reason };
    }
    const verified = write.status === "written"
      && await waitUntil(() => adapter.verify(element, value, context), verificationTimeoutMs);
    if (verified) return { status: "verified", attempts: attempt };
  }

  return { status: "failed", attempts: maxAttempts, reason: "verification-failed" };
}
