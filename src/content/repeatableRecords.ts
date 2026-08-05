import type { CandidateProfile } from "../domain/profile";

export const repeatableGroupKeys = [
  "education",
  "workExperiences",
  "workSamples",
  "projects",
  "awards",
  "languages"
] as const;

export type RepeatableGroupKey = typeof repeatableGroupKeys[number];

export type RepeatableCreateReason =
  | "no-supported-adapter"
  | "up-to-date"
  | "page-has-extra-records"
  | "add-control-not-found"
  | "ambiguous-add-control"
  | "add-control-disabled"
  | "add-control-changed"
  | "page-structure-changed"
  | "navigation-changed"
  | "mutation-timeout"
  | "limit-reached";

export interface RepeatableGroupScan {
  key: RepeatableGroupKey;
  label: string;
  profileCount: number;
  pageCount: number;
  indexes: number[];
  missingCount: number;
  canCreate: boolean;
  reason?: RepeatableCreateReason;
}

export interface RepeatableRecordsScan {
  adapterId: "xiaomi-recruitment" | null;
  groups: RepeatableGroupScan[];
}

export interface RepeatableCreateResult {
  group: RepeatableGroupKey;
  status: "created" | "partial" | "skipped" | "stopped";
  initialPageCount: number;
  finalPageCount: number;
  requestedCount: number;
  createdCount: number;
  remainingCount: number;
  reason?: RepeatableCreateReason;
}

interface GroupDefinition {
  key: RepeatableGroupKey;
  label: string;
  pathAliases: string[];
  sectionClasses: string[];
}

interface InternalGroupScan extends RepeatableGroupScan {
  addControl: HTMLElement | null;
  addFingerprint: string | null;
}

const MAX_CREATE_PER_ACTION = 10;
const DEFAULT_MUTATION_TIMEOUT_MS = 1_500;

const groupDefinitions: GroupDefinition[] = [
  {
    key: "education",
    label: "教育经历",
    pathAliases: ["education_list", "education"],
    sectionClasses: ["resumeEditForm-education"]
  },
  {
    key: "workExperiences",
    label: "实习经历",
    pathAliases: ["internship_list", "internship"],
    sectionClasses: ["resumeEditForm-internship"]
  },
  {
    key: "workSamples",
    label: "作品",
    pathAliases: ["works_list", "works", "work"],
    sectionClasses: ["resumeEditForm-work", "resumeEditForm-works"]
  },
  {
    key: "projects",
    label: "项目经历",
    pathAliases: ["project_list", "project"],
    sectionClasses: ["resumeEditForm-project"]
  },
  {
    key: "awards",
    label: "获奖经历",
    pathAliases: ["award_list", "award"],
    sectionClasses: ["resumeEditForm-award"]
  },
  {
    key: "languages",
    label: "语言能力",
    pathAliases: ["language_list", "language"],
    sectionClasses: ["resumeEditForm-language"]
  }
];

function currentPage(): { origin: string; pathname: string; href: string } {
  if (typeof location === "undefined") return { origin: "local", pathname: "", href: "local" };
  return { origin: location.origin, pathname: location.pathname, href: location.href };
}

function supportedAdapter(): boolean {
  const page = currentPage();
  const realXiaomi = page.origin === "https://xiaomi.jobs.f.mioffice.cn"
    && /^\/internship\/resume\/\d+\/apply\/?$/.test(page.pathname);
  const localFixture = /^(?:http:\/\/)?(?:127\.0\.0\.1|localhost)(?::\d+)?$/.test(page.origin)
    && document.documentElement.dataset.qiuzhaoRepeatableFixture === "xiaomi";
  return realXiaomi || localFixture;
}

function meaningfulRecord(record: object): boolean {
  return Object.entries(record).some(
    ([key, value]) => key !== "id" && typeof value === "string" && value.trim().length > 0
  );
}

function profileRecords(profile: CandidateProfile, key: RepeatableGroupKey): object[] {
  switch (key) {
    case "education": return profile.education;
    case "workExperiences": return profile.workExperiences;
    case "workSamples": return profile.workSamples;
    case "projects": return profile.projects;
    case "awards": return profile.awards;
    case "languages": return profile.languages;
  }
}

function structuralPaths(): string[] {
  const paths = new Set<string>();
  document.querySelectorAll<HTMLElement>("[data-form-field-name], [data-cy]").forEach((element) => {
    const formName = element.getAttribute("data-form-field-name");
    const dataCy = element.getAttribute("data-cy");
    if (formName) paths.add(formName);
    if (dataCy) paths.add(dataCy);
  });
  return [...paths];
}

function indexFromPath(path: string, aliases: string[]): number | null {
  for (const alias of aliases) {
    const prefix = `${alias}[`;
    if (!path.startsWith(prefix)) continue;
    const remainder = path.slice(prefix.length);
    const closingBracket = remainder.indexOf("]");
    if (closingBracket < 1) continue;
    const indexText = remainder.slice(0, closingBracket);
    if (/^\d+$/.test(indexText)) return Number(indexText);
  }
  return null;
}

function pageIndexes(definition: GroupDefinition): number[] {
  const indexes = structuralPaths().flatMap((path) => {
    const index = indexFromPath(path, definition.pathAliases);
    return Number.isInteger(index) ? [index as number] : [];
  });
  return [...new Set(indexes)].sort((left, right) => left - right);
}

function isDisabled(element: HTMLElement): boolean {
  return ("disabled" in element && Boolean((element as HTMLButtonElement).disabled))
    || element.getAttribute("aria-disabled") === "true";
}

function addFingerprint(definition: GroupDefinition, element: HTMLElement): string {
  const mode = element.classList.contains("createFormSection-addBtn") ? "empty" : "populated";
  return [
    "xiaomi-recruitment",
    definition.key,
    mode,
    element.tagName.toLowerCase(),
    [...element.classList].sort().join(".")
  ].join("|");
}

function addCandidates(definition: GroupDefinition): HTMLElement[] {
  const roots = definition.sectionClasses.flatMap((className) =>
    Array.from(document.querySelectorAll<HTMLElement>(`.${className}`))
  );
  return [...new Set(roots.flatMap((root) =>
    Array.from(root.querySelectorAll<HTMLElement>(".formOperate-addBtn, .createFormSection-addBtn"))
      .filter((element) => /^(添加|新增)$/.test((element.textContent ?? "").replace(/\s+/g, " ").trim()))
  ))];
}

function scanInternal(profile: CandidateProfile, definition: GroupDefinition): InternalGroupScan {
  const indexes = pageIndexes(definition);
  const profileCount = profileRecords(profile, definition.key).filter(meaningfulRecord).length;
  const pageCount = indexes.length;
  const missingCount = Math.max(0, profileCount - pageCount);
  const candidates = addCandidates(definition);
  const addControl = candidates.length === 1 ? candidates[0] : null;
  let reason: RepeatableCreateReason | undefined;
  if (missingCount === 0) reason = profileCount < pageCount ? "page-has-extra-records" : "up-to-date";
  else if (candidates.length === 0) reason = "add-control-not-found";
  else if (candidates.length > 1) reason = "ambiguous-add-control";
  else if (addControl && isDisabled(addControl)) reason = "add-control-disabled";
  return {
    key: definition.key,
    label: definition.label,
    profileCount,
    pageCount,
    indexes,
    missingCount,
    canCreate: missingCount > 0 && !reason,
    ...(reason ? { reason } : {}),
    addControl,
    addFingerprint: addControl ? addFingerprint(definition, addControl) : null
  };
}

function publicScan(scan: InternalGroupScan): RepeatableGroupScan {
  const { addControl: _addControl, addFingerprint: _addFingerprint, ...result } = scan;
  return result;
}

export function scanRepeatableRecords(profile: CandidateProfile): RepeatableRecordsScan {
  if (!supportedAdapter()) {
    return {
      adapterId: null,
      groups: groupDefinitions.map((definition) => ({
        key: definition.key,
        label: definition.label,
        profileCount: profileRecords(profile, definition.key).filter(meaningfulRecord).length,
        pageCount: 0,
        indexes: [],
        missingCount: 0,
        canCreate: false,
        reason: "no-supported-adapter"
      }))
    };
  }
  return {
    adapterId: "xiaomi-recruitment",
    groups: groupDefinitions.map((definition) => publicScan(scanInternal(profile, definition)))
  };
}

function waitForIndexChange(definition: GroupDefinition, beforeIndexes: number[], timeoutMs: number): Promise<boolean> {
  const changed = () => JSON.stringify(pageIndexes(definition)) !== JSON.stringify(beforeIndexes);
  if (changed()) return Promise.resolve(true);
  return new Promise((resolve) => {
    const observer = new MutationObserver(() => {
      if (!changed()) return;
      clearTimeout(timer);
      observer.disconnect();
      resolve(true);
    });
    const timer = window.setTimeout(() => {
      observer.disconnect();
      resolve(false);
    }, timeoutMs);
    observer.observe(document.documentElement, { childList: true, subtree: true, attributes: true });
  });
}

function resultStatus(createdCount: number, remainingCount: number): RepeatableCreateResult["status"] {
  if (createdCount === 0) return "stopped";
  return remainingCount === 0 ? "created" : "partial";
}

export async function createMissingRepeatableRecords(
  profile: CandidateProfile,
  group: RepeatableGroupKey,
  options: { maxCreate?: number; mutationTimeoutMs?: number } = {}
): Promise<RepeatableCreateResult> {
  const definition = groupDefinitions.find((candidate) => candidate.key === group);
  if (!definition || !supportedAdapter()) {
    return {
      group,
      status: "skipped",
      initialPageCount: 0,
      finalPageCount: 0,
      requestedCount: 0,
      createdCount: 0,
      remainingCount: 0,
      reason: "no-supported-adapter"
    };
  }

  let before = scanInternal(profile, definition);
  const initialPageCount = before.pageCount;
  const maxCreate = Math.max(0, Math.min(MAX_CREATE_PER_ACTION, options.maxCreate ?? MAX_CREATE_PER_ACTION));
  const requestedCount = Math.min(before.missingCount, maxCreate);
  if (!before.canCreate || requestedCount === 0) {
    return {
      group,
      status: "skipped",
      initialPageCount,
      finalPageCount: before.pageCount,
      requestedCount,
      createdCount: 0,
      remainingCount: before.missingCount,
      reason: before.reason ?? "up-to-date"
    };
  }

  const initialHref = currentPage().href;
  const expectedFingerprint = before.addFingerprint;
  let createdCount = 0;
  let stopReason: RepeatableCreateReason | undefined;
  const mutationTimeoutMs = options.mutationTimeoutMs ?? DEFAULT_MUTATION_TIMEOUT_MS;

  while (createdCount < requestedCount) {
    if (currentPage().href !== initialHref) {
      stopReason = "navigation-changed";
      break;
    }
    const live = scanInternal(profile, definition);
    if (live.pageCount !== before.pageCount || JSON.stringify(live.indexes) !== JSON.stringify(before.indexes)) {
      stopReason = "page-structure-changed";
      break;
    }
    if (!live.addControl || !live.canCreate) {
      stopReason = live.reason ?? "add-control-not-found";
      break;
    }
    if (live.addFingerprint !== expectedFingerprint) {
      stopReason = "add-control-changed";
      break;
    }

    live.addControl.click();
    const mutated = await waitForIndexChange(definition, before.indexes, mutationTimeoutMs);
    if (!mutated) {
      stopReason = "mutation-timeout";
      break;
    }
    if (currentPage().href !== initialHref) {
      stopReason = "navigation-changed";
      break;
    }

    const after = scanInternal(profile, definition);
    const addedIndexes = after.indexes.filter((index) => !before.indexes.includes(index));
    const removedIndexes = before.indexes.filter((index) => !after.indexes.includes(index));
    if (after.pageCount !== before.pageCount + 1 || addedIndexes.length !== 1 || removedIndexes.length !== 0) {
      stopReason = "page-structure-changed";
      break;
    }

    createdCount += 1;
    before = after;
    if (createdCount < requestedCount && after.addFingerprint !== expectedFingerprint) {
      stopReason = "add-control-changed";
      break;
    }
  }

  const final = scanInternal(profile, definition);
  if (!stopReason && final.missingCount > 0 && createdCount === requestedCount) {
    stopReason = "limit-reached";
  }
  return {
    group,
    status: resultStatus(createdCount, final.missingCount),
    initialPageCount,
    finalPageCount: final.pageCount,
    requestedCount,
    createdCount,
    remainingCount: final.missingCount,
    ...(stopReason ? { reason: stopReason } : {})
  };
}
