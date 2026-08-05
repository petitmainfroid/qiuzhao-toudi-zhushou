import { describe, expect, it, vi } from "vitest";
import { createEmptyProfile } from "../domain/profile";
import { fillPage, scanPage, type FillSelection } from "./engine";

function completeTestProfile() {
  const profile = createEmptyProfile();
  profile.basic.fullName = "填写验证";
  profile.basic.email = "fill@example.test";
  profile.basic.gender = "女";
  profile.education[0].degree = "本科";
  profile.projects.push({
    id: "test-project",
    name: "测试项目",
    role: "负责人",
    startDate: "2025-01",
    endDate: "2025-06",
    description: "用于验证内容编辑字段。",
    outcome: "",
    link: ""
  });
  return profile;
}

describe("content fill engine", () => {
  it("scans without changing values and fills only explicit safe selections", async () => {
    document.body.innerHTML = `
      <form>
        <label for="name">姓名</label><input id="name" />
        <label for="email">邮箱</label><input id="email" type="email" />
        <label for="degree">最高学历</label>
        <select id="degree"><option value="">请选择</option><option value="本科">本科</option></select>
        <fieldset><legend>性别</legend>
          <label><input type="radio" name="gender" value="男" />男</label>
          <label><input type="radio" name="gender" value="女" />女</label>
        </fieldset>
        <div class="form-item"><span>项目描述</span><div id="project-description" contenteditable="true"></div></div>
        <label for="captcha">短信验证码</label><input id="captcha" />
        <label for="password">账户密码</label><input id="password" type="password" />
        <label for="resume">上传简历</label><input id="resume" type="file" />
        <button id="submit" type="submit">提交申请</button>
      </form>
    `;
    const submit = vi.fn((event: Event) => event.preventDefault());
    document.querySelector("form")?.addEventListener("submit", submit);
    const inputEvents = vi.fn();
    document.getElementById("name")?.addEventListener("input", inputEvents);

    const profile = completeTestProfile();
    const scan = scanPage(profile);
    expect((document.getElementById("name") as HTMLInputElement).value).toBe("");
    expect(scan.summary.fillable).toBeGreaterThanOrEqual(5);
    expect(scan.fields.find((field) => field.fieldLabel === "短信验证码")?.excludedReason).toBe("verification-control");

    const selectionByPath = new Map(scan.fields
      .filter((field) => field.profilePath && field.hasValue && !field.excludedReason && field.comparisonStatus === "empty")
      .map((field) => [field.profilePath!, { elementId: field.elementId, profilePath: field.profilePath! }]));
    const selections: FillSelection[] = [...selectionByPath.values()];
    const result = await fillPage(profile, selections);

    expect(result.skippedCount).toBe(0);
    expect((document.getElementById("name") as HTMLInputElement).value).toBe("填写验证");
    expect((document.getElementById("email") as HTMLInputElement).value).toBe("fill@example.test");
    expect((document.getElementById("degree") as HTMLSelectElement).value).toBe("本科");
    expect((document.querySelector("input[value='女']") as HTMLInputElement).checked).toBe(true);
    expect(document.getElementById("project-description")?.textContent).toBe("用于验证内容编辑字段。");
    expect((document.getElementById("captcha") as HTMLInputElement).value).toBe("");
    expect((document.getElementById("password") as HTMLInputElement).value).toBe("");
    expect((document.getElementById("resume") as HTMLInputElement).files).toHaveLength(0);
    expect(inputEvents).toHaveBeenCalled();
    expect(submit).not.toHaveBeenCalled();
  });

  it("compares page values without exposing them and requires an exact conflict approval", async () => {
    document.body.innerHTML = `<label for="target">姓名</label><input id="target" value="private-page-only-value" />`;
    const profile = completeTestProfile();
    const firstScan = scanPage(profile);
    const field = firstScan.fields[0];

    expect(field).toMatchObject({
      profilePath: "basic.fullName",
      comparisonStatus: "conflict"
    });
    expect(field.comparisonToken).toBeTruthy();
    expect(JSON.stringify(firstScan)).not.toContain("private-page-only-value");

    const withoutApproval = await fillPage(profile, [{
      elementId: field.elementId,
      profilePath: "basic.fullName"
    }]);
    expect(withoutApproval.outcomes[0]).toMatchObject({
      status: "skipped",
      reason: "conflict-requires-rescan"
    });

    const approvedScan = scanPage(profile);
    const approvedField = approvedScan.fields[0];
    (document.getElementById("target") as HTMLInputElement).value = "changed-after-scan";
    const staleApproval = await fillPage(profile, [{
      elementId: approvedField.elementId,
      profilePath: "basic.fullName",
      conflictApprovalToken: approvedField.comparisonToken
    }]);
    expect(staleApproval.outcomes[0]).toMatchObject({
      status: "skipped",
      reason: "conflict-requires-rescan"
    });
    expect((document.getElementById("target") as HTMLInputElement).value).toBe("changed-after-scan");

    const freshScan = scanPage(profile);
    const freshField = freshScan.fields[0];
    const approved = await fillPage(profile, [{
      elementId: freshField.elementId,
      profilePath: "basic.fullName",
      conflictApprovalToken: freshField.comparisonToken
    }]);
    expect(approved.filledCount).toBe(1);
    expect((document.getElementById("target") as HTMLInputElement).value).toBe(profile.basic.fullName);
  });

  it("uses field-aware normalization for equal values", () => {
    document.body.innerHTML = `
      <label for="email-equal">邮箱</label><input id="email-equal" value=" FILL@EXAMPLE.TEST " />
      <label for="phone-equal">联系电话</label><input id="phone-equal" value="138-0000-0000" />
    `;
    const profile = completeTestProfile();
    profile.basic.phone = "13800000000";

    const scan = scanPage(profile);
    expect(scan.fields.map((field) => field.comparisonStatus)).toEqual(["equal", "equal"]);
    expect(scan.summary.equal).toBe(2);
    expect(scan.summary.fillable).toBe(0);
  });

  it("revalidates mappings before filling", async () => {
    document.body.innerHTML = `<label for="target">姓名</label><input id="target" />`;
    const profile = completeTestProfile();
    const scan = scanPage(profile);
    const field = scan.fields[0];
    document.querySelector("label")!.textContent = "推荐人姓名";

    const result = await fillPage(profile, [{
      elementId: field.elementId,
      profilePath: "basic.email"
    }]);

    expect(result).toMatchObject({ filledCount: 0, skippedCount: 1 });
    expect((document.getElementById("target") as HTMLInputElement).value).toBe("");
  });

  it("reuses a saved site-specific field correction", async () => {
    document.body.innerHTML = `<label for="contact">联系电话</label><input id="contact" />`;
    const profile = completeTestProfile();
    profile.basic.phone = "13800000000";
    const firstScan = scanPage(profile);
    const field = firstScan.fields[0];
    expect(field.profilePath).toBe("basic.phone");

    const mappings = [{
      site: firstScan.site,
      fingerprint: field.fingerprint,
      profilePath: "basic.email",
      canonicalLabel: "邮箱",
      updatedAt: "2026-08-03T10:00:00.000Z"
    }];
    const correctedScan = scanPage(profile, mappings);
    expect(correctedScan.fields[0]).toMatchObject({
      profilePath: "basic.email",
      mappingSource: "saved",
      valuePreview: "fill@example.test"
    });

    const result = await fillPage(profile, [{
      elementId: correctedScan.fields[0].elementId,
      profilePath: "basic.email"
    }], mappings);
    expect(result.filledCount).toBe(1);
    expect((document.getElementById("contact") as HTMLInputElement).value).toBe("fill@example.test");
  });

  it("selects an exact option from a Feishu ATS custom select", async () => {
    document.body.innerHTML = `
      <div class="atsx-form-item">
        <div class="atsx-form-item-label"><label>学历</label></div>
        <div class="atsx-select" id="degree-root">
          <div role="combobox" aria-expanded="false"><input id="education[0].degree" /></div>
          <span class="selected-value"></span>
        </div>
      </div>
      <ul id="degree-popup" hidden>
        <li role="option" class="atsx-select-dropdown-menu-item">硕士</li>
        <li role="option" class="atsx-select-dropdown-menu-item">本科</li>
      </ul>
    `;
    const trigger = document.querySelector<HTMLElement>("[role='combobox']")!;
    const popup = document.getElementById("degree-popup")!;
    trigger.addEventListener("click", () => popup.removeAttribute("hidden"));
    popup.querySelectorAll<HTMLElement>("[role='option']").forEach((option) => {
      option.addEventListener("click", () => {
        document.querySelector<HTMLElement>(".selected-value")!.textContent = option.textContent;
        popup.setAttribute("hidden", "");
      });
    });

    const profile = completeTestProfile();
    const scan = scanPage(profile);
    expect(scan.fields[0]).toMatchObject({ profilePath: "education.0.degree" });
    const result = await fillPage(profile, [{
      elementId: scan.fields[0].elementId,
      profilePath: "education.0.degree"
    }]);

    expect(result).toMatchObject({ filledCount: 1, skippedCount: 0 });
    expect(document.querySelector(".selected-value")?.textContent).toBe(profile.education[0].degree);
  });

  it("excludes Feishu ATS date-range hidden inputs instead of reporting a false fill", () => {
    document.body.innerHTML = `
      <div class="atsx-form-item">
        <div class="atsx-form-item-label"><label>起止时间</label></div>
        <div class="atsx-date-picker atsx-date-picker-period-month">
          <input class="atsx-date-picker-period-hidden-input" type="text" />
        </div>
      </div>
    `;

    const profile = completeTestProfile();
    const scan = scanPage(profile);
    expect(scan.fields[0].excludedReason).toBe("unsupported-control");
  });

  it("searches a Feishu ATS custom select before choosing an exact remote option", async () => {
    document.body.innerHTML = `
      <div class="atsx-form-item">
        <div class="atsx-form-item-label"><label>学校名称</label></div>
        <div class="atsx-select" id="school-root">
          <div role="combobox"><input id="education[0].school" /></div>
          <span class="selected-value"></span>
        </div>
      </div>
      <ul id="school-popup"></ul>
    `;
    const input = document.querySelector<HTMLInputElement>("#school-root input")!;
    input.addEventListener("input", () => {
      if (!input.value) return;
      const option = document.createElement("li");
      option.role = "option";
      option.textContent = input.value;
      option.addEventListener("click", () => {
        document.querySelector<HTMLElement>(".selected-value")!.textContent = option.textContent;
      });
      document.getElementById("school-popup")!.replaceChildren(option);
    });

    const profile = completeTestProfile();
    profile.education[0].school = "测试大学";
    const scan = scanPage(profile);
    const result = await fillPage(profile, [{
      elementId: scan.fields[0].elementId,
      profilePath: "education.0.school"
    }]);

    expect(result.filledCount).toBe(1);
    expect(document.querySelector(".selected-value")?.textContent).toBe("测试大学");
  });
});
