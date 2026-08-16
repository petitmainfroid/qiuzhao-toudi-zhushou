import { describe, expect, it, vi } from "vitest";
import { runFixedPageAction, writeControlVerified } from "./pageDriver";

describe("fixed K2 page action registry", () => {
  it("uses the native setter, dispatches framework events, and returns no values", () => {
    document.body.innerHTML = `<input id="target" />`;
    const input = document.getElementById("target") as HTMLInputElement;
    const events: string[] = [];
    for (const name of ["beforeinput", "input", "change", "blur", "focusout"]) {
      input.addEventListener(name, () => events.push(name));
    }

    const result = runFixedPageAction.call(input, {
      action: "fill",
      strategy: "primary",
      expected: "anonymous expected"
    });

    expect(result).toEqual({ performed: true, verified: true, strategy: "native-setter" });
    expect(events).toEqual(["beforeinput", "input", "change", "blur", "focusout"]);
    expect(JSON.stringify(result)).not.toContain("anonymous expected");
  });

  it("respects a cancelled beforeinput and does not mutate the control", () => {
    document.body.innerHTML = `<textarea id="target">initial</textarea>`;
    const textarea = document.getElementById("target") as HTMLTextAreaElement;
    textarea.addEventListener("beforeinput", (event) => event.preventDefault());

    expect(runFixedPageAction.call(textarea, {
      action: "type",
      strategy: "primary",
      expected: "rejected"
    })).toEqual({
      performed: false,
      verified: false,
      strategy: "native-setter",
      reason: "framework-rejected"
    });
    expect(textarea.value).toBe("initial");
  });

  it("checks and unchecks only the referenced ordinary checkbox", () => {
    document.body.innerHTML = `<input id="target" type="checkbox"><input id="neighbor" type="checkbox">`;
    const input = document.getElementById("target") as HTMLInputElement;
    const neighbor = document.getElementById("neighbor") as HTMLInputElement;

    expect(runFixedPageAction.call(input, {
      action: "check",
      strategy: "primary",
      desired: "checked"
    })).toEqual({ performed: true, verified: true, strategy: "exact-check" });
    expect(input.checked).toBe(true);
    expect(neighbor.checked).toBe(false);
    expect(runFixedPageAction.call(input, {
      action: "check",
      strategy: "primary",
      desired: "unchecked"
    })).toEqual({ performed: true, verified: true, strategy: "exact-check" });
    expect(input.checked).toBe(false);
  });

  it("fails on ambiguous native options and never changes the existing selection", () => {
    document.body.innerHTML = `
      <select id="target">
        <option selected>初始项</option>
        <option value="same">目标项</option>
        <option value="other">目标项</option>
      </select>
    `;
    const select = document.getElementById("target") as HTMLSelectElement;
    expect(runFixedPageAction.call(select, {
      action: "select",
      strategy: "primary",
      expected: "目标项"
    })).toEqual({
      performed: false,
      verified: false,
      strategy: "native-select",
      reason: "option-ambiguous"
    });
    expect(select.selectedOptions[0]?.textContent).toBe("初始项");
  });

  it("selects one exact custom option and requires synchronous readback", () => {
    document.body.innerHTML = `
      <div id="target" role="combobox" aria-expanded="true" aria-label="City"></div>
      <div role="option" data-value="Beijing">Beijing</div>
      <div role="option" data-value="Shanghai">Shanghai</div>
    `;
    const target = document.getElementById("target")!;
    const options = Array.from(document.querySelectorAll<HTMLElement>("[role='option']"));
    options.forEach((option) => option.addEventListener("click", () => {
      options.forEach((candidate) => candidate.setAttribute("aria-selected", "false"));
      option.setAttribute("aria-selected", "true");
      target.setAttribute("aria-valuetext", option.textContent ?? "");
    }));

    expect(runFixedPageAction.call(target, {
      action: "select",
      strategy: "primary",
      expected: "Shanghai"
    })).toEqual({ performed: true, verified: true, strategy: "custom-select" });
    expect(options.map((option) => option.getAttribute("aria-selected"))).toEqual(["false", "true"]);

    expect(runFixedPageAction.call(target, {
      action: "select",
      strategy: "primary",
      expected: "Shenzhen"
    })).toEqual({
      performed: false,
      verified: false,
      strategy: "custom-select",
      reason: "option-not-found"
    });
  });

  it("selects an exact option from a structural Select and Dropdown wrapper", () => {
    document.body.innerHTML = `
      <div class="sd-Dropdown-container">
        <label id="trigger" class="sd-Select-container select">
          <input id="target" placeholder="请选择">
        </label>
      </div>
      <div id="portal"></div>
    `;
    const input = document.getElementById("target") as HTMLInputElement;
    const trigger = document.getElementById("trigger")!;
    trigger.addEventListener("mousedown", () => {
      const portal = document.getElementById("portal")!;
      if (portal.childElementCount) return;
      portal.className = "sd-Dropdown-dropdown";
      for (const value of ["本科", "硕士"]) {
        const option = document.createElement("div");
        option.className = "sd-Menu-content-item";
        option.textContent = value;
        option.addEventListener("click", () => {
          input.value = value;
          option.setAttribute("data-selected", "true");
        });
        portal.append(option);
      }
    });
    expect(runFixedPageAction.call(input, {
      action: "select", strategy: "primary", expected: "硕士"
    })).toEqual({ performed: true, verified: true, strategy: "custom-select" });
    expect(input.value).toBe("硕士");
  });

  it("binds a readonly UD select to its own portalled option list", () => {
    document.body.innerHTML = `
      <div class="ud__select" id="select-root">
        <div class="ud__select__selector"><input id="target" role="combobox" readonly></div>
      </div>
    `;
    const input = document.getElementById("target")!;
    const selector = document.querySelector<HTMLElement>(".ud__select__selector")!;
    selector.addEventListener("click", () => {
      selector.classList.add("ud__select__selector-open");
      if (document.querySelector(".ud__select__dropdown")) return;
      const dropdown = document.createElement("div");
      dropdown.className = "ud__select__dropdown";
      for (const value of ["Bachelor", "Master"]) {
        const option = document.createElement("div");
        option.className = "ud__select__list__item";
        option.textContent = value;
        option.addEventListener("click", () => {
          selector.textContent = value;
          selector.classList.remove("ud__select__selector-open");
        });
        dropdown.append(option);
      }
      document.body.append(dropdown);
    });

    expect(runFixedPageAction.call(input, {
      action: "select", strategy: "primary", expected: "Master"
    })).toEqual({ performed: true, verified: false, strategy: "custom-select", reason: "option-not-found" });
    expect(runFixedPageAction.call(input, {
      action: "select", strategy: "primary", expected: "Master"
    })).toEqual({ performed: true, verified: true, strategy: "custom-select" });
  });

  it("prefers an exact administrative option over suffix-equivalent UD tree nodes", () => {
    document.body.innerHTML = `
      <div class="ud__select">
        <div class="ud__select__selector">
          <input id="target" type="search" role="combobox">
        </div>
      </div>
    `;
    const input = document.getElementById("target") as HTMLInputElement;
    const selector = document.querySelector<HTMLElement>(".ud__select__selector")!;
    const dropdown = document.createElement("div");
    dropdown.className = "ud__select__dropdown";
    const setOptions = (...values: string[]) => {
      dropdown.replaceChildren(...values.map((value) => {
        const option = document.createElement("div");
        option.className = "ud__tree__node__label";
        option.textContent = value;
        option.addEventListener("click", () => {
          selector.replaceChildren(value);
          selector.classList.remove("ud__select__selector-open");
        });
        return option;
      }));
    };
    setOptions("Beijing");
    selector.addEventListener("click", () => selector.classList.add("ud__select__selector-open"));
    input.addEventListener("input", () => setOptions("上海", "上海市"));
    document.body.append(dropdown);

    const payload = {
      action: "select" as const,
      strategy: "primary" as const,
      expected: "上海市",
      matchMode: "administrative-area" as const
    };
    expect(runFixedPageAction.call(input, payload)).toEqual({
      performed: true, verified: false, strategy: "custom-select", reason: "option-not-found"
    });
    expect(runFixedPageAction.call(input, payload)).toEqual({
      performed: true, verified: false, strategy: "custom-select", reason: "option-not-found"
    });
    expect(input.value).toBe("上海市");
    expect(runFixedPageAction.call(input, payload)).toEqual({
      performed: true, verified: true, strategy: "custom-select"
    });
    expect(selector.textContent).toBe("上海市");
  });

  it("accepts one suffix-equivalent administrative UD tree node", () => {
    document.body.innerHTML = `
      <div class="ud__select">
        <div class="ud__select__selector ud__select__selector-open">
          <input id="target" type="search" role="combobox">
        </div>
      </div>
      <div class="ud__select__dropdown"><div class="ud__tree__node__label">上海</div></div>
    `;
    const input = document.getElementById("target") as HTMLInputElement;
    const selector = document.querySelector<HTMLElement>(".ud__select__selector")!;
    document.querySelector<HTMLElement>(".ud__tree__node__label")!.addEventListener("click", () => {
      selector.replaceChildren("上海");
    });

    expect(runFixedPageAction.call(input, {
      action: "select", strategy: "primary", expected: "上海市", matchMode: "administrative-area"
    })).toEqual({ performed: true, verified: true, strategy: "custom-select" });
  });

  it("prefers the city-depth node when a municipality caption repeats in an administrative tree", () => {
    document.body.innerHTML = `
      <div class="ud__select">
        <div class="ud__select__selector ud__select__selector-open">
          <input id="target" type="search" role="combobox">
        </div>
      </div>
      <div class="ud__select__dropdown">
        <div class="ud__tree__node"><i class="ud__tree__node__indent"></i><div class="ud__tree__node__label">北京市</div></div>
        <div class="ud__tree__node"><i class="ud__tree__node__indent"></i><i class="ud__tree__node__indent"></i><div id="city" class="ud__tree__node__label">北京市</div></div>
      </div>
    `;
    const input = document.getElementById("target") as HTMLInputElement;
    const selector = document.querySelector<HTMLElement>(".ud__select__selector")!;
    document.getElementById("city")!.addEventListener("click", () => selector.replaceChildren("北京市"));

    expect(runFixedPageAction.call(input, {
      action: "select", strategy: "primary", expected: "北京市", matchMode: "administrative-area"
    })).toEqual({ performed: true, verified: true, strategy: "custom-select" });
    expect(selector.textContent).toBe("北京市");
  });

  it("never moves a radio action to a neighboring option", () => {
    document.body.innerHTML = `
      <label><input id="first" type="radio" name="degree" value="本科">本科</label>
      <label><input id="second" type="radio" name="degree" value="硕士">硕士</label>
    `;
    const first = document.getElementById("first") as HTMLInputElement;
    const second = document.getElementById("second") as HTMLInputElement;
    expect(runFixedPageAction.call(first, {
      action: "select",
      strategy: "primary",
      expected: "硕士"
    })).toEqual({
      performed: false,
      verified: false,
      strategy: "exact-radio",
      reason: "option-not-found"
    });
    expect(first.checked).toBe(false);
    expect(second.checked).toBe(false);
  });

  it("opens only a non-button combobox and rejects a generic submit-capable button", () => {
    document.body.innerHTML = `
      <div id="combo" role="combobox" aria-expanded="false"></div>
      <button id="button">继续</button>
    `;
    const combo = document.getElementById("combo")!;
    combo.addEventListener("click", () => combo.setAttribute("aria-expanded", "true"));
    expect(runFixedPageAction.call(combo, {
      action: "click",
      strategy: "primary"
    })).toEqual({ performed: true, verified: true, strategy: "open-control" });

    const button = document.getElementById("button")!;
    expect(runFixedPageAction.call(button, {
      action: "click",
      strategy: "primary"
    })).toEqual({
      performed: false,
      verified: false,
      strategy: "open-control",
      reason: "incompatible-action"
    });
  });

  it("performs only fixed add/save repeatable buttons and leaves verification to the workflow", () => {
    document.body.innerHTML = `
      <button id="add" type="button">Add another project</button>
      <button id="save" type="button">Save project</button>
      <button id="submit" type="submit">Submit application</button>
      <button id="delete" type="button">Delete project</button>
    `;
    const add = document.getElementById("add")!;
    const save = document.getElementById("save")!;
    const submit = document.getElementById("submit")!;
    const remove = document.getElementById("delete")!;
    const addClick = vi.fn();
    const saveClick = vi.fn();
    const submitClick = vi.fn();
    const removeClick = vi.fn();
    add.addEventListener("click", addClick);
    save.addEventListener("click", saveClick);
    submit.addEventListener("click", submitClick);
    remove.addEventListener("click", removeClick);

    expect(runFixedPageAction.call(add, {
      action: "click",
      strategy: "primary",
      purpose: "add-repeatable-record"
    })).toEqual({ performed: true, verified: false, strategy: "repeatable-add" });
    expect(runFixedPageAction.call(save, {
      action: "click",
      strategy: "primary",
      purpose: "save-repeatable-record"
    })).toEqual({ performed: true, verified: false, strategy: "repeatable-save" });
    expect(runFixedPageAction.call(submit, {
      action: "click",
      strategy: "primary",
      purpose: "save-repeatable-record"
    })).toEqual(expect.objectContaining({ performed: false, reason: "incompatible-action" }));
    expect(runFixedPageAction.call(remove, {
      action: "click",
      strategy: "primary",
      purpose: "add-repeatable-record"
    })).toEqual(expect.objectContaining({ performed: false, reason: "unsafe-control" }));
    expect([addClick.mock.calls.length, saveClick.mock.calls.length, submitClick.mock.calls.length, removeClick.mock.calls.length])
      .toEqual([1, 1, 0, 0]);
  });

  it("permits a custom repeatable add control only inside a semantically identified group", () => {
    document.body.innerHTML = `
      <section>
        <h2>实习经历</h2>
        <div data-form-field-name="internship_list"></div>
        <div id="allowed">添加</div>
      </section>
      <div id="lookalike">添加</div>
    `;
    const allowed = document.getElementById("allowed")!;
    const lookalike = document.getElementById("lookalike")!;
    const allowedClick = vi.fn();
    const lookalikeClick = vi.fn();
    allowed.addEventListener("click", allowedClick);
    lookalike.addEventListener("click", lookalikeClick);

    expect(runFixedPageAction.call(allowed, {
      action: "click",
      strategy: "primary",
      purpose: "add-repeatable-record"
    })).toEqual({ performed: true, verified: false, strategy: "repeatable-add" });
    expect(runFixedPageAction.call(lookalike, {
      action: "click",
      strategy: "primary",
      purpose: "add-repeatable-record"
    })).toEqual(expect.objectContaining({ performed: false, reason: "incompatible-action" }));
    expect([allowedClick.mock.calls.length, lookalikeClick.mock.calls.length]).toEqual([1, 0]);
  });

  it("allows only an inert repeatable add anchor inside a semantic group", () => {
    document.body.innerHTML = `
      <section>
        <h2>教育背景</h2><div data-form-field-name="education_list">学校 学历 专业</div>
        <a id="allowed" href="javascript:void(0)">添加</a>
        <a id="blocked" href="/submit">添加</a>
      </section>
    `;
    const allowed = document.getElementById("allowed")!;
    const blocked = document.getElementById("blocked")!;
    const allowedClick = vi.fn();
    const blockedClick = vi.fn((event: Event) => event.preventDefault());
    allowed.addEventListener("click", allowedClick);
    blocked.addEventListener("click", blockedClick);
    expect(runFixedPageAction.call(allowed, {
      action: "click", strategy: "primary", purpose: "add-repeatable-record"
    })).toEqual({ performed: true, verified: false, strategy: "repeatable-add" });
    expect(runFixedPageAction.call(blocked, {
      action: "click", strategy: "primary", purpose: "add-repeatable-record"
    })).toEqual(expect.objectContaining({ performed: false, reason: "incompatible-action" }));
    expect([allowedClick.mock.calls.length, blockedClick.mock.calls.length]).toEqual([1, 0]);
  });

  it("clicks the actionable Xiaomi repeatable wrapper instead of its semantic leaf", () => {
    document.body.innerHTML = `
      <section>
        <h2>实习经历</h2>
        <div data-form-field-name="internship_list"></div>
        <div id="wrapper" class="formOperate-addBtn"><span id="leaf">添加</span></div>
      </section>
    `;
    const wrapper = document.getElementById("wrapper")!;
    const leaf = document.getElementById("leaf")!;
    const wrapperClick = vi.fn();
    const leafClick = vi.fn();
    wrapper.addEventListener("click", wrapperClick);
    leaf.addEventListener("click", leafClick);

    expect(runFixedPageAction.call(leaf, {
      action: "click", strategy: "primary", purpose: "add-repeatable-record"
    })).toEqual({ performed: true, verified: false, strategy: "repeatable-add" });
    expect(wrapperClick).toHaveBeenCalledOnce();
    expect(leafClick).not.toHaveBeenCalled();
  });

  it("supports the standard empty contenteditable attribute", () => {
    document.body.innerHTML = `<div id="editor" contenteditable></div>`;
    const editor = document.getElementById("editor")!;
    expect(runFixedPageAction.call(editor, {
      action: "fill",
      strategy: "primary",
      expected: "anonymous rich text"
    })).toEqual({ performed: true, verified: true, strategy: "contenteditable-text" });
    expect(editor.textContent).toBe("anonymous rich text");
  });

  it("fills and verifies exactly two inputs in a marked date-range group", () => {
    document.body.innerHTML = `
      <div data-date-range>
        <input id="start" type="month" aria-label="Start month" />
        <input id="end" type="month" aria-label="End month" />
      </div>
    `;
    const start = document.getElementById("start") as HTMLInputElement;
    const end = document.getElementById("end") as HTMLInputElement;
    const events: string[] = [];
    start.addEventListener("input", () => events.push("start"));
    end.addEventListener("input", () => events.push("end"));

    const result = runFixedPageAction.call(start, {
      action: "fill-range",
      strategy: "primary",
      expectedStart: "2024-09",
      expectedEnd: "2027-06"
    });

    expect(result).toEqual({ performed: true, verified: true, strategy: "native-date-range" });
    expect([start.value, end.value]).toEqual(["2024-09", "2027-06"]);
    expect(events).toEqual(["start", "end"]);
    expect(JSON.stringify(result)).not.toMatch(/2024-09|2027-06/);
  });

  it("fills a year-month range represented by four dropdowns", () => {
    document.body.innerHTML = `
      <div class="date_info" id="range">
        <select id="start-year"><option>2024年</option><option>2025年</option></select>
        <select id="start-month"><option>09月</option><option>10月</option></select>
        <select id="end-year"><option>2027年</option><option>2028年</option></select>
        <select id="end-month"><option>06月</option><option>07月</option></select>
      </div>
    `;
    const range = document.getElementById("range")!;
    const selects = Array.from(range.querySelectorAll("select")) as HTMLSelectElement[];
    const result = runFixedPageAction.call(range, {
      action: "fill-range",
      strategy: "primary",
      expectedStart: "2024-09",
      expectedEnd: "2027-06",
      rangeMode: "year-month-select"
    });

    expect(result).toEqual({ performed: true, verified: true, strategy: "year-month-select-range" });
    expect(selects.map((select) => select.selectedOptions[0]?.textContent)).toEqual(["2024年", "09月", "2027年", "06月"]);
    expect(JSON.stringify(result)).not.toMatch(/2024-09|2027-06/);
  });

  it("opens readonly custom year-month inputs through their dropdown trigger", () => {
    document.body.innerHTML = `
      <div class="date_info" id="range">
        <label class="sd-Select-container"><input readonly placeholder="year"></label>
        <label class="sd-Select-container"><input readonly placeholder="month"></label>
        <label class="sd-Select-container"><input readonly placeholder="year"></label>
        <label class="sd-Select-container"><input readonly placeholder="month"></label>
        <label><input type="checkbox">至今</label>
      </div>
    `;
    const range = document.getElementById("range")!;
    const inputs = Array.from(range.querySelectorAll("input:not([type='checkbox'])")) as HTMLInputElement[];
    const choices = [["2024-year"], ["09-month"], ["2027-year"], ["06-month"]];
    inputs.forEach((input, index) => input.parentElement!.addEventListener("mousedown", () => {
      const menu = document.createElement("div");
      for (const choice of choices[index]!) {
        const option = document.createElement("div");
        option.className = "sd-Menu-content-item";
        option.textContent = choice;
        option.addEventListener("click", () => {
          option.classList.add("sd-Menu-content-item-selected");
          input.value = choice;
        });
        menu.append(option);
      }
      document.body.append(menu);
    }));

    expect(runFixedPageAction.call(range, {
      action: "fill-range", strategy: "primary", rangeMode: "year-month-select",
      expectedStart: "2024-09", expectedEnd: "2027-06"
    })).toEqual({ performed: true, verified: true, strategy: "year-month-select-range" });
    expect(inputs.map((input) => input.value)).toEqual(["2024-year", "09-month", "2027-year", "06-month"]);
  });

  it("paces a controlled four-part range and verifies the complete ordered result", () => {
    document.body.innerHTML = `
      <div class="date_info" id="range">
        <label class="sd-Select-container"><input readonly placeholder="year"><span></span></label>
        <label class="sd-Select-container"><input readonly placeholder="month"><span></span></label>
        <label class="sd-Select-container"><input readonly placeholder="year"><span></span></label>
        <label class="sd-Select-container"><input readonly placeholder="month"><span></span></label>
      </div>
    `;
    const range = document.getElementById("range")!;
    const inputs = Array.from(range.querySelectorAll("input")) as HTMLInputElement[];
    const choices = ["2024-year", "09-month", "2027-year", "06-month"];
    inputs.forEach((input, index) => input.parentElement!.addEventListener("mousedown", () => {
      const option = document.createElement("div");
      option.className = "sd-Menu-content-item";
      option.textContent = choices[index]!;
      option.addEventListener("click", () => { input.parentElement!.querySelector("span")!.textContent = choices[index]!; });
      document.body.append(option);
    }));

    for (const rangeStep of [0, 1, 2, 3] as const) {
      expect(runFixedPageAction.call(range, {
        action: "fill-range", strategy: "primary", rangeMode: "year-month-select", rangeStep,
        expectedStart: "2024-09", expectedEnd: "2027-06"
      })).toEqual({ performed: true, verified: true, strategy: "year-month-select-range" });
    }
    expect(runFixedPageAction.call(range, {
      action: "fill-range", strategy: "primary", rangeMode: "year-month-select", rangeStep: "verify",
      expectedStart: "2024-09", expectedEnd: "2027-06"
    })).toEqual({ performed: true, verified: true, strategy: "year-month-select-range" });
    expect(inputs.map((input) => input.value)).toEqual(["", "", "", ""]);
    expect(inputs.map((input) => input.parentElement!.querySelector("span")!.textContent)).toEqual(choices);
  });

  it("fills a two-sided period-month picker through exact year and month panels", () => {
    document.body.innerHTML = `
      <div id="range" class="atsx-date-picker atsx-date-picker-period-month" data-cy="internship[0].periodInput">
        <div data-cy="internship[0].periodInputBegin"><span data-cy="year">YYYY</span><span data-cy="month">MM</span></div>
        <div data-cy="internship[0].periodInputEnd"><span data-cy="year">YYYY</span><span data-cy="month">MM</span></div>
        <input class="atsx-date-picker-period-hidden-input" />
      </div>
    `;
    const range = document.getElementById("range")!;
    const installPanel = (side: "Begin" | "End") => {
      const panel = document.createElement("div");
      panel.dataset.cy = `internship[0].periodInput${side}Dropdown`;
      const yearList = document.createElement("div");
      yearList.className = "atsx-date-picker-period-month-panel-list";
      const monthList = document.createElement("div");
      monthList.className = "atsx-date-picker-period-month-panel-list";
      for (const year of ["2024", "2027"]) {
        const option = document.createElement("div"); option.dataset.cy = year; option.textContent = year;
        option.addEventListener("click", () => { range.querySelector<HTMLElement>(`[data-cy$='${side}'] [data-cy='year']`)!.textContent = year; });
        yearList.append(option);
      }
      for (const month of ["06", "09"]) {
        const option = document.createElement("div"); option.dataset.cy = month; option.textContent = month;
        option.addEventListener("click", () => { range.querySelector<HTMLElement>(`[data-cy$='${side}'] [data-cy='month']`)!.textContent = month; });
        monthList.append(option);
      }
      panel.append(yearList, monthList); document.body.append(panel);
    };
    range.querySelector<HTMLElement>("[data-cy$='Begin']")!.addEventListener("click", () => installPanel("Begin"));
    range.querySelector<HTMLElement>("[data-cy$='End']")!.addEventListener("click", () => installPanel("End"));

    const result = runFixedPageAction.call(range, {
      action: "fill-range", strategy: "primary", rangeMode: "year-month-select",
      expectedStart: "2024-09", expectedEnd: "2027-06"
    });
    expect(result).toEqual({ performed: true, verified: true, strategy: "year-month-select-range" });
    expect(Array.from(range.querySelectorAll("[data-cy='year'], [data-cy='month']")).map((node) => node.textContent))
      .toEqual(["2024", "09", "2027", "06"]);
  });

  it("fails a date range atomically when the group is ambiguous or beforeinput is rejected", () => {
    document.body.innerHTML = `
      <div data-date-range>
        <input id="start" type="month" value="2020-01" />
        <input id="end" type="month" value="2021-01" />
        <input id="extra" type="month" value="2022-01" />
      </div>
    `;
    const start = document.getElementById("start") as HTMLInputElement;
    expect(runFixedPageAction.call(start, {
      action: "fill-range",
      strategy: "primary",
      expectedStart: "2024-09",
      expectedEnd: "2027-06"
    })).toEqual({
      performed: false,
      verified: false,
      strategy: "native-date-range",
      reason: "incompatible-action"
    });
    expect(start.value).toBe("2020-01");

    document.body.innerHTML = `
      <div data-date-range>
        <input id="start" type="month" value="2020-01" />
        <input id="end" type="month" value="2021-01" />
      </div>
    `;
    const rejectedStart = document.getElementById("start") as HTMLInputElement;
    const rejectedEnd = document.getElementById("end") as HTMLInputElement;
    rejectedEnd.addEventListener("beforeinput", (event) => event.preventDefault());
    expect(runFixedPageAction.call(rejectedStart, {
      action: "fill-range",
      strategy: "primary",
      expectedStart: "2024-09",
      expectedEnd: "2027-06"
    })).toEqual({
      performed: false,
      verified: false,
      strategy: "native-date-range",
      reason: "framework-rejected"
    });
    expect([rejectedStart.value, rejectedEnd.value]).toEqual(["2020-01", "2021-01"]);
  });

  it("fills only the left side when the local range has no end date", () => {
    document.body.innerHTML = `
      <div data-date-range>
        <input id="start" type="month" value="" />
        <input id="end" type="month" value="" />
      </div>
    `;
    const start = document.getElementById("start") as HTMLInputElement;
    const end = document.getElementById("end") as HTMLInputElement;
    expect(runFixedPageAction.call(start, {
      action: "fill-range", strategy: "primary", expectedStart: "2026-05", startOnly: true
    })).toEqual({ performed: true, verified: true, strategy: "native-date-range" });
    expect([start.value, end.value]).toEqual(["2026-05", ""]);
  });

  it("rolls both date inputs back when framework readback rejects one side", () => {
    document.body.innerHTML = `
      <div data-date-range>
        <input id="start" type="month" value="2020-01" />
        <input id="end" type="month" value="2021-01" />
      </div>
    `;
    const start = document.getElementById("start") as HTMLInputElement;
    const end = document.getElementById("end") as HTMLInputElement;
    let reject = true;
    end.addEventListener("input", () => {
      if (reject) {
        reject = false;
        end.value = "2021-01";
      }
    });

    const result = runFixedPageAction.call(start, {
      action: "fill-range",
      strategy: "primary",
      expectedStart: "2024-09",
      expectedEnd: "2027-06"
    });

    expect(result).toEqual({
      performed: true,
      verified: false,
      strategy: "native-date-range",
      reason: "verification-failed"
    });
    expect([start.value, end.value]).toEqual(["2020-01", "2021-01"]);
    expect(JSON.stringify(result)).not.toMatch(/2020-01|2021-01|2024-09|2027-06/);
  });
});

describe("verified page driver", () => {
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
      <div class="generic-select" aria-haspopup="listbox">
        <div role="combobox"><input id="school" class="query-input" /></div>
        <span class="selected-value"></span>
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
          document.querySelector<HTMLElement>(".selected-value")!.textContent = option.textContent;
        });
        document.getElementById("options")!.replaceChildren(option);
      }, 10);
    });

    const result = await writeControlVerified(input, "匿名测试大学", {
      optionTimeoutMs: 250
    });

    expect(result).toEqual({ status: "verified", attempts: 1 });
    expect(document.querySelector(".selected-value")?.textContent).toBe("匿名测试大学");
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
      <div class="generic-date-picker date-picker-period-month" data-date-range>
        <input class="date-picker-period-hidden-input" type="text" />
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
