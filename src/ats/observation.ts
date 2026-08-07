import type { PrivacySafeControl, PrivacySafePageState } from "../bridge/protocol";
import {
  ATS_OBSERVATION_SCHEMA_VERSION,
  type AtsFamilyDetectionContext,
  type AtsObservation,
  type AtsObservedControl,
  type AtsPageType
} from "./contracts";
import { assertShareableAtsObservation } from "./audit";
import { AtsFamilyRegistry } from "./familyRegistry";
import {
  normalizeHttpsOrigin,
  normalizeLanguage,
  normalizeToolVersion,
  sanitizeObservationSemanticText,
  sanitizeObservationText,
  sanitizeTechnicalName,
  templateObservationPath
} from "./sanitize";

export interface CreateAtsObservationOptions {
  captureToolVersion: string;
  capturedAt?: string;
  language?: string;
  pageType?: AtsPageType;
  familyRegistry?: AtsFamilyRegistry;
  familyMarkers?: string[];
}

function safeInputType(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const normalized = value.toLowerCase();
  return /^[a-z][a-z0-9-]{0,31}$/.test(normalized) ? normalized : "text";
}

function sanitizedSemantics(control: PrivacySafeControl): AtsObservedControl["semantics"] {
  const label = sanitizeObservationSemanticText(control.semantics.label, 100);
  const ariaLabel = sanitizeObservationSemanticText(control.semantics.ariaLabel, 100);
  const placeholder = sanitizeObservationSemanticText(control.semantics.placeholder, 80);
  const name = sanitizeTechnicalName(control.semantics.name);
  const nearbyText = sanitizeObservationSemanticText(control.semantics.nearbyText, 100);
  const section = sanitizeObservationSemanticText(control.semantics.section, 80);
  return {
    ...(label ? { label } : {}),
    ...(ariaLabel && ariaLabel !== label ? { ariaLabel } : {}),
    ...(placeholder && placeholder !== label ? { placeholder } : {}),
    ...(name && name !== label ? { name } : {}),
    ...(nearbyText && nearbyText !== label ? { nearbyText } : {}),
    ...(section ? { section } : {})
  };
}

function sanitizedOptions(options: string[] | undefined): string[] | undefined {
  if (!options) return undefined;
  const result = [...new Set(options.map((option) => sanitizeObservationText(option, 80)).filter(Boolean))].slice(0, 50);
  return result.length > 0 ? result : [];
}

function observedControl(control: PrivacySafeControl, index: number): AtsObservedControl {
  const inputType = safeInputType(control.inputType);
  const options = sanitizedOptions(control.options);
  return {
    controlKey: `control_${(index + 1).toString().padStart(4, "0")}`,
    role: control.role,
    tag: control.tag,
    ...(inputType ? { inputType } : {}),
    semantics: sanitizedSemantics(control),
    ...(options ? { options } : {}),
    disabled: control.disabled,
    readOnly: control.readOnly,
    required: control.required,
    multiple: control.multiple,
    boundary: control.boundary,
    safety: control.safety
  };
}

export function createShareableAtsObservation(
  state: PrivacySafePageState,
  options: CreateAtsObservationOptions
): AtsObservation {
  const capturedAt = options.capturedAt ?? new Date().toISOString();
  if (!Number.isFinite(Date.parse(capturedAt))) throw new Error("Invalid ATS observation capture timestamp.");
  const source = {
    origin: normalizeHttpsOrigin(state.origin),
    pathTemplate: templateObservationPath(state.path),
    language: normalizeLanguage(options.language),
    pageType: options.pageType ?? "unknown",
    captureToolVersion: normalizeToolVersion(options.captureToolVersion)
  } as const;
  const controls = state.controls.map(observedControl);
  const context: AtsFamilyDetectionContext = {
    source,
    controls,
    markers: (options.familyMarkers ?? [])
      .map((marker) => sanitizeObservationText(marker, 80))
      .filter(Boolean)
      .slice(0, 20)
  };
  const family = (options.familyRegistry ?? new AtsFamilyRegistry()).detect(context);
  const sections = [...new Set(state.sections
    .map((section) => sanitizeObservationText(section, 80))
    .filter(Boolean))]
    .slice(0, 50);
  const observation: AtsObservation = {
    schemaVersion: ATS_OBSERVATION_SCHEMA_VERSION,
    capturedAt: new Date(capturedAt).toISOString(),
    source,
    family,
    sections,
    controls,
    summary: {
      controlCount: controls.length,
      blockedControlCount: controls.filter((control) => control.safety !== "ordinary").length,
      frameControlCount: controls.filter((control) => control.boundary === "same-origin-frame").length,
      openShadowControlCount: controls.filter((control) => control.boundary === "open-shadow").length,
      sectionCount: sections.length
    },
    privacy: {
      currentValuesIncluded: false,
      sessionReferencesIncluded: false,
      queryValuesIncluded: false,
      fileMetadataIncluded: false
    }
  };
  assertShareableAtsObservation(observation);
  return observation;
}
