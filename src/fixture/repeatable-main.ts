import type { CandidateProfile } from "../domain/profile";
import { fillPage, scanPage, type FillResult, type FillSelection, type ScanResult } from "../content/engine";
import {
  createMissingRepeatableRecords,
  scanRepeatableRecords,
  type RepeatableCreateResult,
  type RepeatableGroupKey,
  type RepeatableRecordsScan
} from "../content/repeatableRecords";

interface FixtureGroup {
  key: RepeatableGroupKey;
  schemaPrefix: string;
  livePrefix: string;
  fields: Array<{ name: string; label: string; textarea?: boolean }>;
}

const fixtureGroups: FixtureGroup[] = [
  {
    key: "education",
    schemaPrefix: "education_list",
    livePrefix: "education",
    fields: [
      { name: "school", label: "学校名称" },
      { name: "degree", label: "学历" },
      { name: "field_of_study", label: "专业" },
      { name: "education_type", label: "学历类型" }
    ]
  },
  {
    key: "workExperiences",
    schemaPrefix: "internship_list",
    livePrefix: "internship",
    fields: [
      { name: "company", label: "公司名称" },
      { name: "title", label: "职位名称" },
      { name: "desc", label: "描述", textarea: true }
    ]
  },
  {
    key: "workSamples",
    schemaPrefix: "works_list",
    livePrefix: "work",
    fields: [
      { name: "link", label: "作品链接" },
      { name: "desc", label: "作品描述", textarea: true }
    ]
  },
  {
    key: "projects",
    schemaPrefix: "project_list",
    livePrefix: "project",
    fields: [
      { name: "name", label: "项目名称" },
      { name: "role", label: "项目角色" },
      { name: "link", label: "项目链接" },
      { name: "desc", label: "项目描述", textarea: true }
    ]
  },
  {
    key: "awards",
    schemaPrefix: "award_list",
    livePrefix: "award",
    fields: [
      { name: "name", label: "获奖名称" },
      { name: "date", label: "获奖时间" },
      { name: "desc", label: "获奖描述", textarea: true }
    ]
  },
  {
    key: "languages",
    schemaPrefix: "language_list",
    livePrefix: "language",
    fields: [
      { name: "language", label: "语言" },
      { name: "proficiency", label: "精通程度" }
    ]
  }
];

declare global {
  interface Window {
    __repeatableFixture: {
      scanRepeatable(profile: CandidateProfile): RepeatableRecordsScan;
      create(profile: CandidateProfile, group: RepeatableGroupKey): Promise<RepeatableCreateResult>;
      scan(profile: CandidateProfile): ScanResult;
      fill(profile: CandidateProfile, selections: FillSelection[]): Promise<FillResult>;
      addClickCount: number;
      deleteClickCount: number;
      submitCount: number;
    };
  }
}

function sectionFor(group: RepeatableGroupKey): HTMLElement {
  return document.querySelector<HTMLElement>(`[data-group="${group}"]`)!;
}

function appendRow(group: FixtureGroup): number {
  const section = sectionFor(group.key);
  const records = section.querySelector<HTMLElement>(".records")!;
  const index = records.children.length;
  const record = document.createElement("div");
  record.className = "record";
  record.dataset.rowIndex = String(index);
  group.fields.forEach((field) => {
    const item = document.createElement("div");
    item.className = "atsx-form-item";
    item.dataset.formFieldName = `${group.schemaPrefix}[${index}].${field.name}`;
    item.dataset.formFieldI18nName = field.label;
    item.dataset.cy = `${group.livePrefix}[${index}].${field.name}Input`;
    const label = document.createElement("div");
    label.className = "atsx-form-item-label";
    label.textContent = field.label;
    const control = document.createElement(field.textarea ? "textarea" : "input");
    item.append(label, control);
    record.append(item);
  });
  records.append(record);
  return index;
}

function updateStatus(scan: RepeatableRecordsScan) {
  const status = document.getElementById("audit-status")!;
  status.replaceChildren(...scan.groups.map((group) => {
    const card = document.createElement("div");
    card.className = "status-card";
    const title = document.createElement("strong");
    title.textContent = group.label;
    const detail = document.createElement("span");
    detail.textContent = `档案 ${group.profileCount} · 网页 ${group.pageCount} · 缺少 ${group.missingCount}`;
    card.append(title, detail);
    return card;
  }));
}

window.__repeatableFixture = {
  scanRepeatable(profile) {
    const result = scanRepeatableRecords(profile);
    updateStatus(result);
    return result;
  },
  async create(profile, group) {
    const result = await createMissingRepeatableRecords(profile, group);
    updateStatus(scanRepeatableRecords(profile));
    document.getElementById("event-log")!.textContent =
      `${group}: 创建 ${result.createdCount}，剩余 ${result.remainingCount}，状态 ${result.status}${result.reason ? ` / ${result.reason}` : ""}`;
    return result;
  },
  scan: scanPage,
  fill: fillPage,
  addClickCount: 0,
  deleteClickCount: 0,
  submitCount: 0
};

fixtureGroups.forEach((group) => {
  const section = sectionFor(group.key);
  const add = section.querySelector<HTMLElement>(".formOperate-addBtn, .createFormSection-addBtn")!;
  add.addEventListener("click", () => {
    window.__repeatableFixture.addClickCount += 1;
    appendRow(group);
    if (add.classList.contains("createFormSection-addBtn")) {
      add.classList.replace("createFormSection-addBtn", "formOperate-addBtn");
    }
  });
  section.querySelector(".delete-record")?.addEventListener("click", () => {
    window.__repeatableFixture.deleteClickCount += 1;
  });
});

appendRow(fixtureGroups.find(({ key }) => key === "education")!);
appendRow(fixtureGroups.find(({ key }) => key === "projects")!);

document.getElementById("repeatable-form")!.addEventListener("submit", (event) => {
  event.preventDefault();
  window.__repeatableFixture.submitCount += 1;
});
