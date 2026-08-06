export type KernelActionCase = {
  id: string;
  label: string;
  action: "fill" | "type" | "select" | "check" | "click";
  profilePath?: string;
  desired?: "checked" | "unchecked";
  controlKind: string;
  boundary: "main" | "same-origin-frame" | "open-shadow";
  frameworkStyle: "native" | "react-style" | "vue-style" | "fallback";
};

export const POSITIVE_ACTION_CASES: KernelActionCase[] = [
  { id: "p01", label: "匿名姓名一", action: "fill", profilePath: "basic.fullName", controlKind: "text", boundary: "main", frameworkStyle: "native" },
  { id: "p02", label: "匿名邮箱", action: "type", profilePath: "basic.email", controlKind: "email", boundary: "main", frameworkStyle: "native" },
  { id: "p03", label: "匿名自我介绍", action: "fill", profilePath: "answers.selfIntroduction", controlKind: "textarea", boundary: "main", frameworkStyle: "native" },
  { id: "p04", label: "匿名最高学历", action: "select", profilePath: "education.0.degree", controlKind: "single-select", boundary: "main", frameworkStyle: "native" },
  { id: "p05", label: "匿名意向城市", action: "select", profilePath: "jobPreference.preferredCities", controlKind: "multiple-select", boundary: "main", frameworkStyle: "native" },
  { id: "p06", label: "匿名性别女", action: "select", profilePath: "basic.gender", controlKind: "radio", boundary: "main", frameworkStyle: "native" },
  { id: "p07", label: "匿名普通勾选", action: "check", desired: "checked", controlKind: "checkbox-check", boundary: "main", frameworkStyle: "native" },
  { id: "p08", label: "匿名普通取消", action: "check", desired: "unchecked", controlKind: "checkbox-uncheck", boundary: "main", frameworkStyle: "native" },
  { id: "p09", label: "匿名出生日期", action: "fill", profilePath: "basic.birthDate", controlKind: "date", boundary: "main", frameworkStyle: "native" },
  { id: "p10", label: "匿名入学月份", action: "fill", profilePath: "education.0.startDate", controlKind: "month", boundary: "main", frameworkStyle: "native" },
  { id: "p11", label: "匿名个人优势", action: "fill", profilePath: "answers.strengths", controlKind: "contenteditable", boundary: "main", frameworkStyle: "native" },
  { id: "p12", label: "匿名岗位选择器", action: "click", controlKind: "open-control", boundary: "main", frameworkStyle: "native" },
  { id: "p13", label: "匿名 React 姓名", action: "fill", profilePath: "basic.preferredName", controlKind: "text", boundary: "main", frameworkStyle: "react-style" },
  { id: "p14", label: "匿名 React 描述", action: "fill", profilePath: "answers.selfEvaluation", controlKind: "textarea", boundary: "main", frameworkStyle: "react-style" },
  { id: "p15", label: "匿名 Vue 城市", action: "type", profilePath: "basic.currentCity", controlKind: "text", boundary: "main", frameworkStyle: "vue-style" },
  { id: "p16", label: "匿名回退文本", action: "fill", profilePath: "basic.hometown", controlKind: "text", boundary: "main", frameworkStyle: "fallback" },
  { id: "p17", label: "匿名 Frame 学校", action: "fill", profilePath: "education.0.school", controlKind: "text", boundary: "same-origin-frame", frameworkStyle: "native" },
  { id: "p18", label: "匿名 Frame 描述", action: "fill", profilePath: "workExperiences.0.description", controlKind: "textarea", boundary: "same-origin-frame", frameworkStyle: "native" },
  { id: "p19", label: "匿名 Frame 学制", action: "select", profilePath: "education.0.educationType", controlKind: "single-select", boundary: "same-origin-frame", frameworkStyle: "native" },
  { id: "p20", label: "匿名 Frame 政治面貌", action: "select", profilePath: "basic.politicalStatus", controlKind: "radio", boundary: "same-origin-frame", frameworkStyle: "native" },
  { id: "p21", label: "匿名 Shadow 专业", action: "fill", profilePath: "education.0.major", controlKind: "text", boundary: "open-shadow", frameworkStyle: "native" },
  { id: "p22", label: "匿名 Shadow 勾选", action: "check", desired: "checked", controlKind: "checkbox-check", boundary: "open-shadow", frameworkStyle: "native" },
  { id: "p23", label: "匿名 Shadow 毕业月份", action: "fill", profilePath: "education.0.endDate", controlKind: "month", boundary: "open-shadow", frameworkStyle: "native" },
  { id: "p24", label: "匿名 Shadow 规划", action: "fill", profilePath: "answers.careerPlan", controlKind: "contenteditable", boundary: "open-shadow", frameworkStyle: "native" }
];

export const RESTRICTED_ACTION_CASES = [
  { id: "s01", label: "匿名账号密码", safety: "credential", action: "fill", profilePath: "basic.fullName" },
  { id: "s02", label: "匿名短信验证码", safety: "verification", action: "fill", profilePath: "basic.fullName" },
  { id: "s03", label: "匿名 CAPTCHA", safety: "verification", action: "fill", profilePath: "basic.fullName" },
  { id: "s04", label: "匿名身份证号", safety: "identity", action: "fill", profilePath: "basic.fullName" },
  { id: "s05", label: "匿名上传简历", safety: "file", action: "fill", profilePath: "basic.fullName" },
  { id: "s06", label: "匿名提交申请", safety: "final-submit", action: "click" },
  { id: "s07", label: "匿名撤回申请", safety: "destructive", action: "click" },
  { id: "s08", label: "匿名同意隐私条款", safety: "consent", action: "check", desired: "checked" }
] as const;

export function anonymousKernelFrame(): string {
  return `<!doctype html>
  <html lang="zh-CN"><head><meta charset="utf-8"></head><body>
    <label>匿名 Frame 学校 <input data-case="p17" value="frame-initial"></label>
    <label>匿名 Frame 描述 <textarea data-case="p18">frame-description-initial</textarea></label>
    <label>匿名 Frame 学制 <select data-case="p19"><option>初始</option><option>全日制</option></select></label>
    <label><input data-case="p20" type="radio" name="political" value="群众">匿名 Frame 政治面貌</label>
  </body></html>`;
}

export function anonymousKernelPage(): string {
  return `<!doctype html>
  <html lang="zh-CN">
  <head><meta charset="utf-8"><title>K2 匿名动作验收</title></head>
  <body>
    <h1>K2 匿名动作验收</h1>
    <form id="ordinary-form" onsubmit="window.__submitCount += 1; return false">
      <label>匿名姓名一 <input data-case="p01" value="name-initial"></label>
      <label>匿名邮箱 <input data-case="p02" type="email" value="email-initial@example.test"></label>
      <label>匿名自我介绍 <textarea data-case="p03">intro-initial</textarea></label>
      <label>匿名最高学历 <select data-case="p04"><option>初始</option><option>硕士</option></select></label>
      <label>匿名意向城市 <select data-case="p05" multiple><option selected>初始</option><option>北京</option><option>上海</option></select></label>
      <label><input data-case="p06" type="radio" name="gender" value="女">匿名性别女</label>
      <label><input data-case="p07" type="checkbox">匿名普通勾选</label>
      <label><input data-case="p08" type="checkbox" checked>匿名普通取消</label>
      <label>匿名出生日期 <input data-case="p09" type="date" value="1999-01-01"></label>
      <label>匿名入学月份 <input data-case="p10" type="month" value="2020-01"></label>
      <div data-case="p11" contenteditable="true" aria-label="匿名个人优势">strength-initial</div>
      <div data-case="p12" role="combobox" tabindex="0" aria-expanded="false" aria-label="匿名岗位选择器">初始</div>
      <label>匿名 React 姓名 <input data-case="p13" value="react-name-initial"></label>
      <label>匿名 React 描述 <textarea data-case="p14">react-textarea-initial</textarea></label>
      <label>匿名 Vue 城市 <input data-case="p15" value="vue-city-initial"></label>
      <label>匿名回退文本 <input data-case="p16" value="fallback-initial"></label>

      <label>匿名账号密码 <input data-case="s01" type="password" value="secret-initial"></label>
      <label>匿名短信验证码 <input data-case="s02" autocomplete="one-time-code" value="000000"></label>
      <label>匿名 CAPTCHA <input data-case="s03" value="captcha-initial"></label>
      <label>匿名身份证号 <input data-case="s04" value="identity-initial"></label>
      <label>匿名上传简历 <input data-case="s05" type="file"></label>
      <button data-case="s06" type="submit">匿名提交申请</button>
      <button data-case="s07" type="button">匿名撤回申请</button>
      <label><input data-case="s08" type="checkbox">匿名同意隐私条款</label>

      <label>匿名禁用字段 <input data-case="i01" disabled value="disabled-initial"></label>
      <label>匿名只读字段 <input data-case="i02" readonly value="readonly-initial"></label>
      <label>匿名动态隐藏 <input data-case="i03" value="hidden-initial"></label>
      <label>匿名旧快照 <input data-case="i04" value="stale-initial"></label>
      <label>匿名节点替换 <input data-case="i05" value="replace-initial"></label>
      <label>匿名伪造引用 <input data-case="i06" value="forged-initial"></label>
      <label>匿名旧会话 <input data-case="i07" value="session-initial"></label>
      <button data-case="i08" type="button">匿名普通按钮</button>

      <label>匿名持续拒绝 <input data-case="r01" value="reject-initial"></label>
      <label>匿名缺失选项 <select data-case="r02"><option>初始</option><option>已有选项</option></select></label>
    </form>
    <div id="shadow-host"></div>
    <iframe title="匿名同源 K2 子表单" src="/frame"></iframe>
    <script>
      window.__submitCount = 0;
      window.__clipboardCount = 0;
      window.__events = {};
      window.__initial = {};
      try {
        Object.defineProperty(navigator, 'clipboard', { value: {
          writeText: async () => { window.__clipboardCount += 1; }
        }});
      } catch {}

      const shadow = document.getElementById('shadow-host').attachShadow({ mode: 'open' });
      shadow.innerHTML = \`
        <label>匿名 Shadow 专业 <input data-case="p21" value="shadow-major-initial"></label>
        <label><input data-case="p22" type="checkbox">匿名 Shadow 勾选</label>
        <label>匿名 Shadow 毕业月份 <input data-case="p23" type="month" value="2021-01"></label>
        <div data-case="p24" contenteditable="true" aria-label="匿名 Shadow 规划">shadow-plan-initial</div>
      \`;

      document.querySelector('[data-case="p12"]').addEventListener('click', (event) => {
        event.currentTarget.setAttribute('aria-expanded', 'true');
      });
      let fallbackBeforeInput = 0;
      document.querySelector('[data-case="p16"]').addEventListener('beforeinput', (event) => {
        fallbackBeforeInput += 1;
        if (fallbackBeforeInput === 1) event.preventDefault();
      });
      document.querySelector('[data-case="r01"]').addEventListener('beforeinput', (event) => event.preventDefault());

      function allRoots() {
        const roots = [document, shadow];
        const frameDocument = document.querySelector('iframe')?.contentDocument;
        if (frameDocument) roots.push(frameDocument);
        return roots;
      }
      function control(caseId) {
        for (const root of allRoots()) {
          const found = root.querySelector('[data-case="' + caseId + '"]');
          if (found) return found;
        }
        return null;
      }
      function state(element) {
        if (!element) return 'missing';
        const tagName = String(element.tagName || '').toUpperCase();
        const inputType = String(element.type || '').toLowerCase();
        if (tagName === 'INPUT' && (inputType === 'checkbox' || inputType === 'radio')) {
          return 'checked:' + element.checked;
        }
        if (tagName === 'SELECT') {
          return Array.from(element.selectedOptions).map(option => option.textContent).join('|');
        }
        if ('value' in element) return String(element.value);
        return (element.textContent || '') + '|expanded:' + element.getAttribute('aria-expanded');
      }
      window.__kernelCapture = () => {
        for (const root of allRoots()) {
          for (const element of root.querySelectorAll('[data-case]')) {
            const caseId = element.getAttribute('data-case');
            window.__initial[caseId] = state(element);
            window.__events[caseId] = [];
            for (const eventName of ['beforeinput', 'input', 'change', 'blur', 'focusout', 'click']) {
              element.addEventListener(eventName, () => window.__events[caseId].push(eventName));
            }
          }
        }
      };
      window.__kernelRead = (caseId) => ({
        state: state(control(caseId)),
        initial: window.__initial[caseId],
        events: window.__events[caseId] || []
      });
      window.__kernelMutationCount = (caseId) => state(control(caseId)) === window.__initial[caseId] ? 0 : 1;
      window.__kernelWrongTargetCount = (completed) => Object.keys(window.__initial)
        .filter(caseId => !completed.includes(caseId))
        .filter(caseId => state(control(caseId)) !== window.__initial[caseId]).length;
      window.__kernelHide = (caseId) => { control(caseId).style.display = 'none'; };
      window.__kernelReplace = (caseId) => {
        const old = control(caseId);
        const next = old.cloneNode(true);
        old.replaceWith(next);
      };
    </script>
  </body></html>`;
}

export function anonymousKernelProfile() {
  return {
    schemaVersion: 2,
    updatedAt: "kernel-actions-revision-1",
    basic: {
      fullName: "匿名候选人甲",
      preferredName: "匿名 React 候选人",
      gender: "女",
      birthDate: "2001-02-03",
      phone: "",
      email: "candidate@example.test",
      nationality: "不存在选项",
      currentCity: "深圳",
      hometown: "杭州",
      politicalStatus: "群众"
    },
    education: [{
      id: "education-anonymous",
      school: "匿名测试大学",
      degree: "硕士",
      educationType: "全日制",
      major: "匿名测试专业",
      startDate: "2022-09",
      endDate: "2025-06",
      gpa: "",
      ranking: ""
    }],
    workExperiences: [{
      id: "work-anonymous",
      company: "",
      department: "",
      role: "",
      startDate: "",
      endDate: "",
      description: "匿名 Frame 经历描述"
    }],
    projects: [],
    workSamples: [],
    awards: [],
    languages: [],
    jobPreference: {
      targetRoles: "",
      preferredCities: "北京、上海",
      availableDate: ""
    },
    answers: {
      selfIntroduction: "匿名自我介绍内容",
      selfEvaluation: "匿名 React 描述内容",
      strengths: "匿名个人优势内容",
      careerPlan: "匿名 Shadow 规划内容"
    }
  };
}
