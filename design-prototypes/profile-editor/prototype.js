(function () {
  "use strict";

  const root = document.querySelector("#prototype-root");
  if (!root) return;

  const STORAGE_KEY = "qiuzhao.profile-design-prototype.v1";
  const variant = document.body.dataset.variant || "dossier";
  const variants = {
    dossier: {
      number: "01",
      name: "档案册",
      intro: "按人事档案的章节逻辑整理资料，长表单也能保持稳定秩序。",
      hint: "章节编号与纸张层级是这套方案的核心。"
    },
    bento: {
      number: "02",
      name: "资料拼图",
      intro: "用模块大小表达资料优先级，一眼看见完成情况与缺口。",
      hint: "卡片跨度与状态颜色是这套方案的核心。"
    },
    guided: {
      number: "03",
      name: "引导填写",
      intro: "一次处理一类信息，用清晰步骤降低第一次建档的压力。",
      hint: "单步骤聚焦与明确前进路径是这套方案的核心。"
    },
    quiet: {
      number: "04",
      name: "安静画布",
      intro: "减少容器和分割线，让注意力停留在正在填写的信息上。",
      hint: "留白、文字层级与折叠章节是这套方案的核心。"
    },
    compact: {
      number: "05",
      name: "投递工作台",
      intro: "压缩滚动距离，同屏管理更多字段，面向频繁投递的熟练用户。",
      hint: "章节地图、紧凑字段与状态总览是这套方案的核心。"
    }
  };

  const icon = (name) => {
    const paths = {
      arrow: '<path d="m9 18 6-6-6-6"/><path d="M15 12H3"/>',
      back: '<path d="m15 18-6-6 6-6"/><path d="M9 12h12"/>',
      check: '<path d="m5 12 4 4L19 6"/>',
      download: '<path d="M12 3v12"/><path d="m7 10 5 5 5-5"/><path d="M5 21h14"/>',
      eye: '<path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12Z"/><circle cx="12" cy="12" r="2.5"/>',
      plus: '<path d="M12 5v14M5 12h14"/>',
      shield: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z"/><path d="m9 12 2 2 4-4"/>',
      upload: '<path d="M12 16V4"/><path d="m7 9 5-5 5 5"/><path d="M5 20h14"/>',
      x: '<path d="m6 6 12 12M18 6 6 18"/>'
    };
    return `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">${paths[name]}</svg>`;
  };

  const schema = window.QIUZHAO_PROFILE_PROTOTYPE_SCHEMA;
  if (!schema?.sections) throw new Error("Profile prototype schema failed to load.");
  const sections = schema.sections;
  const profileUnits = sections.flatMap((section) => section.groups || [section]);
  const repeatableUnits = profileUnits.filter((unit) => unit.repeatable);

  function escapeHtml(value) {
    return String(value)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function fieldMarkup(field, recordIndex) {
    const [label, baseName, type, valueSource, flags = "", help = ""] = field;
    const name = recordIndex === undefined ? baseName : `${baseName}[${recordIndex}]`;
    const sensitive = flags.includes("sensitive");
    const wide = flags.includes("wide");
    const contextual = flags.includes("contextual");
    const core = flags.includes("core");
    const id = name.replace(/[^a-zA-Z0-9]+/g, "-");
    const completionAttribute = core ? ' data-core="true"' : "";
    let control = "";
    if (type === "select") {
      const opts = valueSource
        .map((option, index) => `<option value="${escapeHtml(option)}">${index === 0 && !option ? "请选择" : escapeHtml(option)}</option>`)
        .join("");
      control = `<select id="${id}" name="${name}"${completionAttribute}>${opts}</select>`;
    } else if (type === "textarea") {
      control = `<textarea id="${id}" name="${name}" rows="4" placeholder="${escapeHtml(valueSource || "请输入内容")}"${completionAttribute}></textarea>`;
    } else {
      control = `<input id="${id}" name="${name}" type="${type}" placeholder="${escapeHtml(typeof valueSource === "string" ? valueSource : "")}"${completionAttribute} ${type === "password" ? 'autocomplete="off"' : ""} />`;
    }
    const reveal = type === "password"
      ? `<button class="reveal-button" type="button" data-reveal="${id}" aria-label="显示或隐藏证件号码">${icon("eye")}<span>显示</span></button>`
      : "";
    return `<div class="field ${wide ? "field--wide" : ""} ${sensitive ? "field--sensitive" : ""} ${contextual ? "field--contextual" : ""}">
      <label for="${id}">${label}${sensitive ? '<span class="sensitive-dot" title="敏感信息">需确认</span>' : ""}${contextual ? '<span class="contextual-dot">投递时确认</span>' : ""}</label>
      <div class="control-wrap">${control}${reveal}</div>
      ${help ? `<span class="field-help">${escapeHtml(help)}</span>` : ""}
    </div>`;
  }

  function recordMarkup(unit, index) {
    const baseline = unit.baseline && index === 0;
    return `<article class="record" data-record-index="${index}" data-baseline-record="${baseline}">
      <header class="record__header">
        <p><span class="record-number">${String(index + 1).padStart(2, "0")}</span><span>第 ${index + 1} 条</span></p>
        ${index > 0 ? `<button class="text-button record-remove" type="button">${icon("x")}删除</button>` : ""}
      </header>
      <div class="field-grid">${unit.fields.map((field) => fieldMarkup(field, index)).join("")}</div>
    </article>`;
  }

  function unitContentMarkup(unit) {
    return unit.repeatable
      ? `<div class="records" data-records="${unit.id}">${recordMarkup(unit, 0)}</div><button class="add-record button button--soft" type="button" data-add-record="${unit.id}">${icon("plus")}添加${unit.title}</button>`
      : `<div class="field-grid">${unit.fields.map((field) => fieldMarkup(field)).join("")}</div>`;
  }

  function groupMarkup(group) {
    return `<section class="form-subsection" data-profile-group="${group.id}">
      <header class="form-subsection__heading"><div><h3>${group.title}</h3><p>${group.description}</p></div><span>${group.repeatable ? "可添加多条" : "独立信息"}</span></header>
      ${unitContentMarkup(group)}
    </section>`;
  }

  function uploadMarkup(upload) {
    return `<label class="upload-zone upload-zone--choice" for="${upload.id}">${icon("upload")}<strong>${upload.title}</strong><span>${upload.description}</span><input id="${upload.id}" data-prototype-upload type="file" accept="${upload.accept}" /><em data-file-name="${upload.id}" data-default-note="${upload.note}">${upload.note}</em></label>`;
  }

  function sectionMarkup(section, index) {
    const warning = section.sensitive
      ? `<div class="privacy-callout">${icon("shield")}<p><strong>第三方敏感信息</strong><span>请确保已获得相关联系人的知情同意；网页写入仍需逐项确认。</span></p></div>`
      : "";
    const content = section.uploads
      ? `<div class="upload-choice-grid">${section.uploads.map(uploadMarkup).join("")}</div>`
      : section.groups
        ? `<div class="form-subsections">${section.groups.map(groupMarkup).join("")}</div>`
        : unitContentMarkup(section);
    return `<section class="profile-section" id="section-${section.id}" data-section="${section.id}" data-step="${index}">
      <header class="section-heading">
        <div class="section-index">${String(index + 1).padStart(2, "0")}</div>
        <div><p>${section.kicker}</p><h2>${section.title}</h2><span>${section.description}</span></div>
        <output class="section-status" data-section-status="${section.id}">未填写</output>
      </header>
      ${warning}
      <div class="section-body">${content}</div>
    </section>`;
  }

  function navMarkup() {
    return sections
      .map((section, index) => `<a href="#section-${section.id}" data-section-link="${section.id}" ${index === 0 ? 'aria-current="step"' : ""}><span>${String(index + 1).padStart(2, "0")}</span>${section.title}<output data-nav-status="${section.id}"></output></a>`)
      .join("");
  }

  const meta = variants[variant];
  root.innerHTML = `
    <header class="app-header">
      <a class="brand" href="index.html" aria-label="返回五套方案">
        <span class="brand-mark" aria-hidden="true">秋</span>
        <span><strong>秋招投递助手</strong><small>个人档案</small></span>
      </a>
      <nav class="top-navigation" aria-label="产品导航">
        <a aria-current="page" href="#profile-editor">我的档案</a>
        <a href="#privacy">隐私说明</a>
        <a href="index.html">切换设计</a>
      </nav>
      <button class="button button--outline" type="button" id="export-draft">${icon("download")}导出原型 JSON</button>
    </header>

    <main id="profile-editor">
      <section class="profile-hero">
        <div>
          <p class="eyebrow">方案 ${meta.number} · ${meta.name}</p>
          <h1>建立一次，后续重复使用</h1>
          <p>${meta.intro}</p>
          <small>${meta.hint}</small>
        </div>
        <div class="completion-card" aria-label="档案完成度">
          <div class="completion-ring" style="--progress: 0" id="completion-ring"><strong id="completion-value">0%</strong><span>已完成</span></div>
          <p><strong id="completed-sections">0 / ${sections.length}</strong><span>资料分组有内容</span></p>
        </div>
      </section>

      <div class="profile-workspace">
        <aside class="section-sidebar" aria-label="档案目录">
          <div class="sidebar-heading"><p>档案目录</p><span id="dirty-state">所有更改已保存</span></div>
          <nav>${navMarkup()}</nav>
        </aside>

        <form class="profile-form" id="profile-form" novalidate>
          <div class="prototype-notice">${icon("shield")}<p><strong>独立设计原型</strong><span>仅使用浏览器里的原型专用本地存储，不读取或修改正式扩展档案。</span></p></div>
          <div class="sections-grid">${sections.map(sectionMarkup).join("")}</div>
          <div class="guided-actions" hidden>
            <button class="button button--outline" id="previous-step" type="button">${icon("back")}上一步</button>
            <p><span id="current-step">1</span> / ${sections.length}</p>
            <button class="button button--primary" id="next-step" type="button">下一步${icon("arrow")}</button>
          </div>
        </form>

        <aside class="profile-dock" aria-label="档案管理">
          <header><p>档案管理</p><span>本机</span></header>
          <button class="profile-choice" type="button" aria-current="true"><span>默认档案</span><small>五套方案共用草稿</small></button>
          <dl>
            <div><dt>保存位置</dt><dd>浏览器本地</dd></div>
            <div><dt>正式档案</dt><dd>不会读取</dd></div>
            <div><dt>网页提交</dt><dd>不提供</dd></div>
          </dl>
          <button class="text-button" type="button" id="clear-draft">清空原型草稿</button>
        </aside>
      </div>
    </main>

    <footer class="save-bar">
      <div><span class="save-indicator"></span><p><strong id="save-status">原型草稿已就绪</strong><small>保存后可切换到其他方案继续比较</small></p></div>
      <button class="button button--primary" id="save-draft" type="button">${icon("check")}保存草稿</button>
    </footer>`;

  const form = document.querySelector("#profile-form");
  const saveStatus = document.querySelector("#save-status");
  const dirtyState = document.querySelector("#dirty-state");
  let guidedStep = 0;

  function serialize() {
    const data = {};
    form.querySelectorAll("input[name], select[name], textarea[name]").forEach((control) => {
      if (!control.value) return;
      if (data[control.name] === undefined) data[control.name] = control.value;
      else if (Array.isArray(data[control.name])) data[control.name].push(control.value);
      else data[control.name] = [data[control.name], control.value];
    });
    return data;
  }

  function restore() {
    let data = {};
    try {
      data = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
    } catch {
      data = {};
    }
    repeatableUnits.forEach((unit) => {
      const savedIndices = Object.keys(data)
        .filter((name) => name.startsWith(`${unit.id}.`))
        .map((name) => Number(name.match(/\[(\d+)\]$/)?.[1]))
        .filter(Number.isFinite);
      const highestIndex = savedIndices.length ? Math.max(...savedIndices) : 0;
      const container = document.querySelector(`[data-records="${unit.id}"]`);
      for (let index = 1; index <= highestIndex; index += 1) {
        container.insertAdjacentHTML("beforeend", recordMarkup(unit, index));
      }
    });
    Object.entries(data).forEach(([name, stored]) => {
      const controls = [...form.querySelectorAll(`[name="${CSS.escape(name)}"]`)];
      const values = Array.isArray(stored) ? stored : [stored];
      controls.forEach((control, index) => {
        control.value = values[index] || values[0] || "";
      });
    });
    updateProgress();
  }

  function updateProgress() {
    const coreControls = [...form.querySelectorAll("[data-core]")].filter((control) => {
      const record = control.closest(".record");
      if (!record || record.dataset.baselineRecord === "true") return true;
      return [...record.querySelectorAll("input[name], select[name], textarea[name]")]
        .some((item) => item.value.trim());
    });
    const filled = coreControls.filter((control) => control.value.trim()).length;
    const percent = coreControls.length ? Math.round((filled / coreControls.length) * 100) : 0;
    document.querySelector("#completion-value").textContent = `${percent}%`;
    document.querySelector("#completion-ring").style.setProperty("--progress", percent);

    let completedSections = 0;
    sections.forEach((section) => {
      const element = document.querySelector(`[data-section="${section.id}"]`);
      const sectionControls = [...element.querySelectorAll("input[name], select[name], textarea[name]")];
      const sectionFilled = sectionControls.filter((control) => control.value.trim()).length;
      const hasUpload = [...element.querySelectorAll("[data-prototype-upload]")]
        .some((input) => input.files.length > 0);
      const active = sectionFilled > 0 || hasUpload;
      if (active) completedSections += 1;
      const label = active ? `${sectionFilled || 1} 项` : "未填写";
      document.querySelector(`[data-section-status="${section.id}"]`).textContent = label;
      document.querySelector(`[data-nav-status="${section.id}"]`).textContent = active ? "已填" : "";
      element.classList.toggle("has-content", active);
    });
    document.querySelector("#completed-sections").textContent = `${completedSections} / ${sections.length}`;
  }

  function saveDraft() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(serialize()));
      saveStatus.textContent = "原型草稿已保存在本机";
      dirtyState.textContent = "所有更改已保存";
      document.body.classList.remove("is-dirty");
    } catch {
      saveStatus.textContent = "本地保存失败，请检查浏览器设置";
    }
  }

  form.addEventListener("input", () => {
    document.body.classList.add("is-dirty");
    dirtyState.textContent = "有未保存更改";
    saveStatus.textContent = "草稿有未保存更改";
    updateProgress();
  });
  form.addEventListener("change", updateProgress);
  document.querySelector("#save-draft").addEventListener("click", saveDraft);

  document.querySelectorAll("[data-prototype-upload]").forEach((input) => {
    input.addEventListener("change", (event) => {
      const output = document.querySelector(`[data-file-name="${event.target.id}"]`);
      output.textContent = event.target.files[0]?.name || output.dataset.defaultNote;
      dirtyState.textContent = "原型只显示文件名，不保存文件内容";
      updateProgress();
    });
  });

  document.addEventListener("click", (event) => {
    const reveal = event.target.closest("[data-reveal]");
    if (reveal) {
      const input = document.getElementById(reveal.dataset.reveal);
      input.type = input.type === "password" ? "text" : "password";
      reveal.querySelector("span").textContent = input.type === "password" ? "显示" : "隐藏";
    }

    const addButton = event.target.closest("[data-add-record]");
    if (addButton) {
      const unit = repeatableUnits.find((item) => item.id === addButton.dataset.addRecord);
      const container = document.querySelector(`[data-records="${unit.id}"]`);
      const indices = [...container.querySelectorAll(".record")]
        .map((record) => Number(record.dataset.recordIndex));
      const index = Math.max(-1, ...indices) + 1;
      container.insertAdjacentHTML("beforeend", recordMarkup(unit, index));
      container.lastElementChild.querySelector("input, select, textarea")?.focus();
      updateProgress();
    }

    const removeButton = event.target.closest(".record-remove");
    if (removeButton) {
      removeButton.closest(".record").remove();
      updateProgress();
      document.body.classList.add("is-dirty");
    }
  });

  document.querySelector("#clear-draft").addEventListener("click", () => {
    if (!window.confirm("确定清空五套设计方案共用的原型草稿吗？")) return;
    localStorage.removeItem(STORAGE_KEY);
    form.reset();
    document.querySelectorAll("[data-file-name]").forEach((output) => {
      output.textContent = output.dataset.defaultNote;
    });
    saveStatus.textContent = "原型草稿已清空";
    dirtyState.textContent = "所有更改已保存";
    updateProgress();
  });

  document.querySelector("#export-draft").addEventListener("click", () => {
    const blob = new Blob([JSON.stringify(serialize(), null, 2)], { type: "application/json" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = "qiuzhao-profile-prototype.json";
    link.click();
    URL.revokeObjectURL(link.href);
  });

  const links = [...document.querySelectorAll("[data-section-link]")];
  links.forEach((link) => {
    link.addEventListener("click", (event) => {
      links.forEach((item) => item.removeAttribute("aria-current"));
      link.setAttribute("aria-current", "step");
      if (variant === "guided") {
        event.preventDefault();
        guidedStep = sections.findIndex((section) => section.id === link.dataset.sectionLink);
        showGuidedStep(true);
      }
    });
  });

  function showGuidedStep(shouldScroll) {
    document.querySelectorAll(".profile-section").forEach((section, index) => {
      section.hidden = index !== guidedStep;
    });
    document.querySelector("#current-step").textContent = String(guidedStep + 1);
    document.querySelector("#previous-step").disabled = guidedStep === 0;
    const next = document.querySelector("#next-step");
    next.innerHTML = guidedStep === sections.length - 1
      ? `${icon("check")}完成浏览`
      : `下一步${icon("arrow")}`;
    links.forEach((link, index) => {
      if (index === guidedStep) link.setAttribute("aria-current", "step");
      else link.removeAttribute("aria-current");
    });
    if (shouldScroll) {
      document.querySelector(".profile-form").scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }

  if (variant === "guided") {
    document.querySelector(".guided-actions").hidden = false;
    document.querySelector("#previous-step").addEventListener("click", () => {
      if (guidedStep > 0) {
        guidedStep -= 1;
        showGuidedStep(true);
      }
    });
    document.querySelector("#next-step").addEventListener("click", () => {
      if (guidedStep < sections.length - 1) {
        guidedStep += 1;
        showGuidedStep(true);
      } else {
        saveDraft();
      }
    });
    showGuidedStep(false);
  }

  restore();
})();
