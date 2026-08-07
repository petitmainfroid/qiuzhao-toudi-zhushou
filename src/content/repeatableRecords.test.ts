import { afterEach, describe, expect, it, vi } from "vitest";
import { feishuRecruitingTemplate } from "../ats/defaultTemplates";
import {
  createProjectRecord,
  createWorkExperienceRecord,
  createEmptyProfile
} from "../domain/profile";
import {
  createMissingRepeatableRecords,
  scanRepeatableRecords
} from "./repeatableRecords";

const feishuOptions = { template: feishuRecruitingTemplate };

function meaningfulProjects(count: number) {
  return Array.from({ length: count }, (_, index) => ({
    ...createProjectRecord(),
    id: `project-${index}`,
    name: `Project ${index + 1}`
  }));
}

function projectField(index: number): HTMLElement {
  const field = document.createElement("div");
  field.dataset.cy = `project[${index}].nameInput`;
  return field;
}

afterEach(() => {
  document.body.replaceChildren();
  vi.restoreAllMocks();
});

describe("repeatable recruitment records", () => {
  it("compares meaningful profile records with distinct visible page indexes", () => {
    document.body.innerHTML = `
      <section class="resumeEditForm-project">
        <div data-cy="project[0].nameInput"></div>
        <div data-cy="project[0].roleInput"></div>
        <button class="formOperate-addBtn">添加</button>
      </section>
    `;
    const profile = createEmptyProfile();
    profile.projects = meaningfulProjects(3);
    profile.workExperiences = [createWorkExperienceRecord()];

    const scan = scanRepeatableRecords(profile, feishuOptions);
    expect(scan.adapterId).toBe("feishu-recruiting");
    expect(scan.groups.find(({ key }) => key === "projects")).toMatchObject({
      profileCount: 3,
      pageCount: 1,
      indexes: [0],
      missingCount: 2,
      canCreate: true
    });
    expect(scan.groups.find(({ key }) => key === "workExperiences")).toMatchObject({
      profileCount: 0,
      pageCount: 0,
      missingCount: 0,
      canCreate: false,
      reason: "up-to-date"
    });
  });

  it("creates one project row at a time and rescans after every click", async () => {
    document.body.innerHTML = `
      <form>
        <section class="resumeEditForm-project">
          <div class="records"><div data-cy="project[0].nameInput"></div></div>
          <button type="button" class="formOperate-addBtn">添加</button>
          <button type="button" class="delete-record">删除</button>
        </section>
        <button type="submit">提交</button>
      </form>
    `;
    const add = document.querySelector<HTMLButtonElement>(".formOperate-addBtn")!;
    const clickSpy = vi.fn();
    const deleteSpy = vi.fn();
    const submitSpy = vi.fn((event: Event) => event.preventDefault());
    add.addEventListener("click", () => {
      clickSpy();
      document.querySelector(".records")!.append(projectField(document.querySelectorAll(".records [data-cy]").length));
    });
    document.querySelector(".delete-record")!.addEventListener("click", deleteSpy);
    document.querySelector("form")!.addEventListener("submit", submitSpy);

    const profile = createEmptyProfile();
    profile.projects = meaningfulProjects(3);
    const result = await createMissingRepeatableRecords(profile, "projects", {
      ...feishuOptions,
      mutationTimeoutMs: 50
    });

    expect(result).toMatchObject({
      status: "created",
      initialPageCount: 1,
      finalPageCount: 3,
      requestedCount: 2,
      createdCount: 2,
      remainingCount: 0
    });
    expect(clickSpy).toHaveBeenCalledTimes(2);
    expect(deleteSpy).not.toHaveBeenCalled();
    expect(submitSpy).not.toHaveBeenCalled();
  });

  it("stops after an empty-section control changes identity", async () => {
    document.body.innerHTML = `
      <section class="resumeEditForm-internship">
        <div class="records"></div>
        <button type="button" class="createFormSection-addBtn">添加</button>
      </section>
    `;
    const add = document.querySelector<HTMLButtonElement>(".createFormSection-addBtn")!;
    const clickSpy = vi.fn();
    add.addEventListener("click", () => {
      clickSpy();
      const field = document.createElement("div");
      field.dataset.cy = "internship[0].companyInput";
      document.querySelector(".records")!.append(field);
      add.className = "formOperate-addBtn";
    });
    const profile = createEmptyProfile();
    profile.workExperiences = [0, 1].map((index) => ({
      ...createWorkExperienceRecord(),
      id: `internship-${index}`,
      company: `Company ${index + 1}`
    }));

    const result = await createMissingRepeatableRecords(profile, "workExperiences", {
      ...feishuOptions,
      mutationTimeoutMs: 50
    });
    expect(result).toMatchObject({
      status: "partial",
      createdCount: 1,
      remainingCount: 1,
      reason: "add-control-changed"
    });
    expect(clickSpy).toHaveBeenCalledTimes(1);
  });

  it("refuses ambiguous add controls without clicking either candidate", async () => {
    document.body.innerHTML = `
      <section class="resumeEditForm-project">
        <button type="button" class="formOperate-addBtn">添加</button>
        <button type="button" class="formOperate-addBtn">添加</button>
      </section>
    `;
    const clickSpy = vi.fn();
    document.querySelectorAll("button").forEach((button) => button.addEventListener("click", clickSpy));
    const profile = createEmptyProfile();
    profile.projects = meaningfulProjects(1);

    const result = await createMissingRepeatableRecords(profile, "projects", {
      ...feishuOptions,
      mutationTimeoutMs: 50
    });
    expect(result).toMatchObject({ status: "skipped", createdCount: 0, reason: "ambiguous-add-control" });
    expect(clickSpy).not.toHaveBeenCalled();
  });

  it("stops when one click changes the row structure by more than one", async () => {
    document.body.innerHTML = `
      <section class="resumeEditForm-project">
        <div class="records"><div data-cy="project[0].nameInput"></div></div>
        <button type="button" class="formOperate-addBtn">添加</button>
      </section>
    `;
    document.querySelector("button")!.addEventListener("click", () => {
      document.querySelector(".records")!.append(projectField(1), projectField(2));
    });
    const profile = createEmptyProfile();
    profile.projects = meaningfulProjects(3);

    const result = await createMissingRepeatableRecords(profile, "projects", {
      ...feishuOptions,
      mutationTimeoutMs: 50
    });
    expect(result).toMatchObject({
      status: "stopped",
      createdCount: 0,
      finalPageCount: 3,
      reason: "page-structure-changed"
    });
  });

  it("enforces the ten-row action bound", async () => {
    document.body.innerHTML = `
      <section class="resumeEditForm-project">
        <div class="records"><div data-cy="project[0].nameInput"></div></div>
        <button type="button" class="formOperate-addBtn">添加</button>
      </section>
    `;
    const clickSpy = vi.fn();
    document.querySelector("button")!.addEventListener("click", () => {
      clickSpy();
      document.querySelector(".records")!.append(projectField(document.querySelectorAll(".records [data-cy]").length));
    });
    const profile = createEmptyProfile();
    profile.projects = meaningfulProjects(12);

    const result = await createMissingRepeatableRecords(profile, "projects", {
      ...feishuOptions,
      mutationTimeoutMs: 50
    });
    expect(result).toMatchObject({
      status: "partial",
      requestedCount: 10,
      createdCount: 10,
      finalPageCount: 11,
      remainingCount: 1,
      reason: "limit-reached"
    });
    expect(clickSpy).toHaveBeenCalledTimes(10);
  });

  it("does not enable the adapter from page structure alone", async () => {
    document.body.innerHTML = `
      <section class="resumeEditForm-project">
        <button type="button" class="formOperate-addBtn">添加</button>
      </section>
    `;
    const clickSpy = vi.fn();
    document.querySelector("button")!.addEventListener("click", clickSpy);
    const profile = createEmptyProfile();
    profile.projects = meaningfulProjects(1);

    expect(scanRepeatableRecords(profile).adapterId).toBeNull();
    const result = await createMissingRepeatableRecords(profile, "projects");
    expect(result.reason).toBe("no-supported-adapter");
    expect(clickSpy).not.toHaveBeenCalled();
  });
});
