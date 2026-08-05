import { describe, expect, it } from "vitest";
import { discoverFields } from "./dom";
import { matchFields } from "./matcher";

describe("DOM field discovery", () => {
  it("describes labeled, ARIA, select, radio, and editable controls", () => {
    document.body.innerHTML = `
      <form>
        <label for="candidate-name">姓名</label>
        <input id="candidate-name" autocomplete="name" />
        <input aria-label="Email Address" type="email" />
        <label>最高学历<select name="degree"><option>本科</option><option>硕士</option></select></label>
        <fieldset><legend>性别</legend><label><input type="radio" name="gender" />男</label></fieldset>
        <div role="group"><span>项目描述</span><div contenteditable="true"></div></div>
      </form>
    `;

    const fields = discoverFields();
    expect(fields).toHaveLength(5);
    expect(fields[0]).toMatchObject({ label: "姓名", autocomplete: "name", kind: "text" });
    expect(fields[2]).toMatchObject({ label: "最高学历", kind: "select", options: ["本科", "硕士"] });
    expect(fields[3]).toMatchObject({ kind: "radio", contextText: expect.stringContaining("性别") });
    expect(fields[4]).toMatchObject({ kind: "contenteditable", contextText: expect.stringContaining("项目描述") });
    expect(fields.every((field) => field.elementId.length > 0)).toBe(true);
  });

  it("matches discovered fields without reading their current values", () => {
    document.body.innerHTML = `
      <label for="phone">手机号码</label><input id="phone" value="不应进入描述" type="tel" />
      <label for="resume">上传简历</label><input id="resume" type="file" />
    `;
    const descriptors = discoverFields();
    const results = matchFields(descriptors);

    expect(JSON.stringify(descriptors)).not.toContain("不应进入描述");
    expect(results[0].profilePath).toBe("basic.phone");
    expect(results[1].excludedReason).toBe("unsupported-control");
  });

  it("reads Feishu ATS form-item metadata used by the Xiaomi recruitment page", () => {
    document.body.innerHTML = `
      <section class="resumeEditForm-education">
        <h2>教育经历</h2>
        <div class="atsx-form-item" data-form-field-name="education_list[1].field_of_study" data-form-field-i18n-name="专业">
          <div class="atsx-form-item-label"><label>专业</label></div>
          <div class="atsx-form-item-control"><input /></div>
        </div>
      </section>
    `;

    const [field] = discoverFields();
    expect(field).toMatchObject({
      label: "专业",
      name: "education_list[1].field_of_study",
      contextText: expect.stringContaining("教育经历")
    });
    expect(matchFields([field])[0].profilePath).toBe("education.1.major");
  });
});
