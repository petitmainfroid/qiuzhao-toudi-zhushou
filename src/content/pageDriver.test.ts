import { describe, expect, it, vi } from "vitest";
import { controlAdapterId, readControlCandidates, writeControlVerified } from "./pageDriver";

describe("verified page driver", () => {
  it.each([
    {
      id: "feishu-select",
      root: "atsx-select",
      selected: "atsx-select-selection-selected-value"
    },
    {
      id: "feishu-select",
      root: "ud-select",
      selected: "ud-select-selection-selected-value"
    },
    {
      id: "ant-select",
      root: "ant-select",
      selected: "ant-select-selection-item"
    },
    {
      id: "element-select",
      root: "el-select",
      selected: "el-select__selected-item"
    }
  ])("routes and verifies $root through the $id adapter", async ({ id, root, selected }) => {
    document.body.innerHTML = `
      <div class="${root}">
        <div role="combobox"><input id="framework-target"></div>
        <span class="${selected}"></span>
      </div>
      <div role="option">精确选项</div>
    `;
    const input = document.getElementById("framework-target") as HTMLInputElement;
    document.querySelector<HTMLElement>("[role='option']")!.addEventListener("click", () => {
      document.querySelector<HTMLElement>(`.${selected}`)!.textContent = "精确选项";
    });

    expect(controlAdapterId(input)).toBe(id);
    expect(await writeControlVerified(input, "精确选项")).toEqual({ status: "verified", attempts: 1 });
    expect(readControlCandidates(input)).toContain("精确选项");
  });

  it("routes a framework-neutral ARIA combobox without treating typed search text as selection", async () => {
    document.body.innerHTML = `
      <div id="aria-target" role="combobox" tabindex="0" aria-valuetext=""></div>
      <div role="option">ARIA 精确选项</div>
    `;
    const combobox = document.getElementById("aria-target")!;
    document.querySelector<HTMLElement>("[role='option']")!.addEventListener("click", () => {
      combobox.setAttribute("aria-valuetext", "ARIA 精确选项");
    });

    expect(controlAdapterId(combobox)).toBe("aria-combobox");
    expect(await writeControlVerified(combobox, "ARIA 精确选项")).toEqual({ status: "verified", attempts: 1 });
    expect(readControlCandidates(combobox)).toEqual(["ARIA 精确选项"]);
  });

  it("blocks credential, attachment, hidden, disabled, and submit-like controls before adapter routing", async () => {
    document.body.innerHTML = `
      <input id="password" type="password">
      <input id="file" type="file">
      <input id="hidden" type="hidden">
      <input id="disabled" disabled>
      <input id="readonly" readonly>
      <input id="submit-label" aria-label="提交申请">
      <button id="submit" type="submit">提交申请</button>
    `;
    for (const id of ["password", "file", "hidden", "disabled", "readonly", "submit-label", "submit"]) {
      const element = document.getElementById(id)!;
      expect(controlAdapterId(element), id).toBeNull();
      const result = await writeControlVerified(element, "must-not-write");
      expect(result.status, id).toBe("failed");
      expect(result.attempts, id).toBe(0);
    }
    expect((document.getElementById("submit-label") as HTMLInputElement).value).toBe("");
  });

  it("returns an actionable option-not-found failure within the bounded adapter wait", async () => {
    document.body.innerHTML = `
      <div class="ant-select">
        <div role="combobox"><input id="missing-option"></div>
        <span class="ant-select-selection-item"></span>
      </div>
    `;
    const input = document.getElementById("missing-option") as HTMLInputElement;
    const result = await writeControlVerified(input, "不存在的选项", { optionTimeoutMs: 50 });
    expect(result).toEqual({ status: "failed", attempts: 1, reason: "option-not-found" });
  });

  it("honors a family driver hint and fails closed when the requested adapter is incompatible", async () => {
    document.body.innerHTML = `<input id="ordinary" />`;
    const input = document.getElementById("ordinary") as HTMLInputElement;

    expect(await writeControlVerified(input, "must-not-write", {
      driverHint: "feishu-select",
      verification: "selected-option"
    })).toEqual({
      status: "failed",
      attempts: 0,
      reason: "unsupported-control"
    });
    expect(input.value).toBe("");
  });

  it("rejects a non-verifying template strategy before it can write", async () => {
    document.body.innerHTML = `<input id="ordinary" />`;
    const input = document.getElementById("ordinary") as HTMLInputElement;

    expect(await writeControlVerified(input, "must-not-write", {
      driverHint: "native",
      verification: "none"
    })).toEqual({
      status: "failed",
      attempts: 0,
      reason: "unsupported-control"
    });
    expect(input.value).toBe("");
  });

  it("retries one idempotent text write and returns no raw rejected page value", async () => {
    document.body.innerHTML = `<input id="target" />`;
    const input = document.getElementById("target") as HTMLInputElement;
    input.scrollIntoView = vi.fn();
    let rejections = 1;
    input.addEventListener("input", () => {
      if (rejections > 0) {
        rejections -= 1;
        input.value = "private-page-rejection";
      }
    });

    const result = await writeControlVerified(input, "expected value", {
      verificationTimeoutMs: 25
    });

    expect(result).toEqual({ status: "verified", attempts: 2 });
    expect(input.value).toBe("expected value");
    expect(input.scrollIntoView).toHaveBeenCalled();
    expect(JSON.stringify(result)).not.toContain("private-page-rejection");
  });

  it("fails closed when a framework rejects both writes", async () => {
    document.body.innerHTML = `<input id="target" />`;
    const input = document.getElementById("target") as HTMLInputElement;
    input.addEventListener("input", () => {
      input.value = "page-only-secret";
    });

    const result = await writeControlVerified(input, "expected value", {
      verificationTimeoutMs: 25
    });

    expect(result).toEqual({
      status: "failed",
      attempts: 2,
      reason: "verification-failed"
    });
    expect(JSON.stringify(result)).not.toContain("page-only-secret");
  });

  it("waits for an exact remote custom-select option and verifies its selected marker", async () => {
    document.body.innerHTML = `
      <div class="atsx-select">
        <div role="combobox"><input id="school" /></div>
        <span class="atsx-select-selection-selected-value"></span>
      </div>
      <ul id="options"></ul>
    `;
    const input = document.getElementById("school") as HTMLInputElement;
    input.addEventListener("input", () => {
      window.setTimeout(() => {
        const option = document.createElement("li");
        option.role = "option";
        option.textContent = input.value;
        option.addEventListener("click", () => {
          document.querySelector<HTMLElement>(".atsx-select-selection-selected-value")!.textContent = option.textContent;
        });
        document.getElementById("options")!.replaceChildren(option);
      }, 10);
    });

    const result = await writeControlVerified(input, "匿名测试大学", {
      optionTimeoutMs: 250
    });

    expect(result).toEqual({ status: "verified", attempts: 1 });
    expect(document.querySelector(".atsx-select-selection-selected-value")?.textContent).toBe("匿名测试大学");
  });

  it("selects every exact option in a native multiple select", async () => {
    document.body.innerHTML = `
      <select id="roles" multiple>
        <option>产品经理</option>
        <option>产品运营</option>
        <option>研发工程师</option>
      </select>
    `;
    const select = document.getElementById("roles") as HTMLSelectElement;

    const result = await writeControlVerified(select, "产品经理、产品运营");

    expect(result).toEqual({ status: "verified", attempts: 1 });
    expect(Array.from(select.selectedOptions).map((option) => option.textContent)).toEqual(["产品经理", "产品运营"]);
  });

  it("writes and verifies a rich-text control with framework events", async () => {
    document.body.innerHTML = `<div id="editor" contenteditable="true"></div>`;
    const editor = document.getElementById("editor")!;
    const input = vi.fn();
    editor.addEventListener("input", input);

    const result = await writeControlVerified(editor, "只使用匿名测试内容。");

    expect(result).toEqual({ status: "verified", attempts: 1 });
    expect(editor.textContent).toBe("只使用匿名测试内容。");
    expect(input).toHaveBeenCalledOnce();
  });

  it("does not accept a date-range hidden value unless both visible months update", async () => {
    document.body.innerHTML = `
      <div class="atsx-date-picker atsx-date-picker-period atsx-date-picker-period-month" data-date-range>
        <input class="atsx-date-picker-period-hidden-input" type="text" />
        <span>开始月份未更新</span><span>结束月份未更新</span>
      </div>
    `;
    const input = document.querySelector<HTMLInputElement>("input")!;

    const result = await writeControlVerified(input, JSON.stringify({
      start: "2024-09",
      end: "2027-06"
    }), { verificationTimeoutMs: 25 });

    expect(result).toEqual({
      status: "failed",
      attempts: 2,
      reason: "verification-failed"
    });
  });
});
