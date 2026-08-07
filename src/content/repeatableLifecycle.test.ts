import { describe, expect, it, vi } from "vitest";
import { feishuRecruitingTemplate } from "../ats/defaultTemplates";
import { completeRepeatableLifecycles } from "./repeatableLifecycle";

const lifecycleOptions = { template: feishuRecruitingTemplate };

function recordFixture(buttons = `<button type="button">保存</button>`) {
  document.body.innerHTML = `
    <div class="record" data-repeatable-record>
      <input id="school" value="Synthetic University">
      ${buttons}
    </div>
  `;
  return {
    record: document.querySelector<HTMLElement>(".record")!,
    input: document.getElementById("school") as HTMLInputElement
  };
}

describe("repeatable record lifecycle", () => {
  it("clicks one record-local save, waits for mutation, and verifies values again", async () => {
    const { record, input } = recordFixture();
    const save = record.querySelector<HTMLButtonElement>("button")!;
    const clicks = vi.fn(() => {
      record.dataset.saved = "true";
      save.disabled = true;
      save.textContent = "已保存";
    });
    save.addEventListener("click", clicks);

    const result = await completeRepeatableLifecycles([{
      element: input,
      profilePath: "education.0.school",
      value: "Synthetic University"
    }], { ...lifecycleOptions, mutationTimeoutMs: 50 });

    expect(result).toEqual([{
      group: "education",
      index: 0,
      status: "saved",
      fieldCount: 1,
      saveClicked: true
    }]);
    expect(clicks).toHaveBeenCalledOnce();
  });

  it("is idempotently verified when a page has no record-local save control", async () => {
    const { input } = recordFixture("");
    expect(await completeRepeatableLifecycles([{
      element: input,
      profilePath: "projects.2.name",
      value: "Synthetic Project"
    }], lifecycleOptions)).toEqual([{
      group: "projects",
      index: 2,
      status: "stopped",
      fieldCount: 1,
      saveClicked: false,
      reason: "verification-failed"
    }]);

    input.value = "Synthetic Project";
    expect(await completeRepeatableLifecycles([{
      element: input,
      profilePath: "projects.2.name",
      value: "Synthetic Project"
    }], lifecycleOptions)).toEqual([{
      group: "projects",
      index: 2,
      status: "verified",
      fieldCount: 1,
      saveClicked: false,
      reason: "no-save-required"
    }]);
  });

  it("fails closed for ambiguous saves and never clicks submit-like controls", async () => {
    const { record, input } = recordFixture(`
      <button type="button" id="save-a">保存</button>
      <button type="button" id="save-b">保存</button>
      <button type="button" id="final">提交申请</button>
    `);
    const clicks = vi.fn();
    record.querySelectorAll("button").forEach((button) => button.addEventListener("click", clicks));

    expect(await completeRepeatableLifecycles([{
      element: input,
      profilePath: "workExperiences.0.company",
      value: "Synthetic University"
    }], lifecycleOptions)).toEqual([{
      group: "workExperiences",
      index: 0,
      status: "stopped",
      fieldCount: 1,
      saveClicked: false,
      reason: "ambiguous-save-control"
    }]);
    expect(clicks).not.toHaveBeenCalled();
  });

  it("stops on a bounded save mutation timeout without retrying the click", async () => {
    const { record, input } = recordFixture();
    const save = record.querySelector<HTMLButtonElement>("button")!;
    const clicks = vi.fn();
    save.addEventListener("click", clicks);

    const result = await completeRepeatableLifecycles([{
      element: input,
      profilePath: "education.0.school",
      value: "Synthetic University"
    }], { ...lifecycleOptions, mutationTimeoutMs: 50 });
    expect(result[0]).toMatchObject({ status: "stopped", saveClicked: true, reason: "mutation-timeout" });
    expect(clicks).toHaveBeenCalledOnce();
  });
});
