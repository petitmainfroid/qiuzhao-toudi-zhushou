export function ctripManifestPage(): string {
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><title>匿名 Ctrip Careers 简历结构</title></head><body>
    <main><h1>匿名 Ctrip Careers 候选人简历</h1><form id="resume-editor">
      <section><h2>简历导入</h2>
        <label>导入简历文件 <input type="file" name="resumeImportFile" accept=".pdf,.doc,.docx"></label>
      </section>
      <section><h2>基本信息</h2>
        <label>姓名 <input name="name" value="page-name-private"></label>
        <label>手机号 <input name="mobile" value="page-mobile-private"></label>
        <label>邮箱 <input type="email" name="email" value="page-email-private@example.test"></label>
        <label>性别 <div id="gender" role="combobox" name="gender" aria-label="性别" aria-expanded="false" aria-controls="gender-options"></div></label>
        <label>出生日期 <input type="date" name="birthday" value="1990-01-01"></label>
        <label>居住城市 <input name="residenceState" value="page-city-private"></label>
        <label>短信验证码 <input name="smsCode" value="verification-private"></label>
      </section>
      <section><h2>教育背景</h2>
        <label>学校 <div id="school" role="combobox" name="recruitEducationList[0].schoolName" aria-label="学校"></div></label>
        <label>学历 <div id="degree" role="combobox" name="recruitEducationList[0].highestDegree" aria-label="学历" aria-expanded="false" aria-controls="degree-options"></div></label>
        <label>专业 <input name="recruitEducationList[0].majorName" value="page-major-private"></label>
        <label>入学日期 <input type="date" name="recruitEducationList[0].startDate" value="2010-09-01"></label>
        <label>毕业日期 <input type="date" name="recruitEducationList[0].endDate" value="2014-06-30"></label>
        <label>经历描述 <textarea name="recruitEducationList[0].description">manual-education-description-private</textarea></label>
      </section>
      <section><h2>工作经历</h2>
        <label>公司 <input name="recruitWorkingList[0].companyName" value="page-company-private"></label>
        <label>职位 <input name="recruitWorkingList[0].jobTitle" value="page-role-private"></label>
        <label>开始日期 <input type="date" name="recruitWorkingList[0].startDate" value="2015-01-01"></label>
        <label>结束日期 <input type="date" name="recruitWorkingList[0].endDate" value="2015-06-30"></label>
        <label>当前任职 <input type="checkbox" name="recruitWorkingList[0].currentJob"></label>
        <label>经历描述 <textarea name="recruitWorkingList[0].description">page-work-description-private</textarea></label>
      </section>
      <section><h2>技能和专长</h2>
        <label>语言 <input name="recruitLanguageList[0].languageType" value="page-language-private"></label>
        <label>掌握程度 <div id="language-level" role="combobox" name="recruitLanguageList[0].languageLevel" aria-label="掌握程度" aria-expanded="false" aria-controls="language-level-options"></div></label>
        <label>技能 <input name="recruitSkillList[0].skillName" value="manual-skill-private"></label>
        <label>证书 <input name="recruitCertificateList[0].certificateName" value="manual-certificate-private"></label>
      </section>
      <section><h2>自我描述</h2><label>自我描述 <textarea name="evaluation">page-evaluation-private</textarea></label></section>
      <section><h2>作品集或附件</h2>
        <label>作品集或附件 <input type="file" name="PPtFileList" accept=".pdf,.doc,.docx"></label>
      </section>
      <label>企业自定义题 <input name="enterprise.question" value="custom-private"></label>
      <button id="save-resume" type="button">保存</button>
      <button type="submit">提交申请</button>
    </form></main>
    <script>
      let parseCount = 0; let portfolioCount = 0; let smsPromptCount = 0; let saveCount = 0; let submitCount = 0;
      function wireCombo(id, options) {
        const control = document.getElementById(id);
        control.addEventListener('click', () => {
          control.setAttribute('aria-expanded', 'true');
          const listId = control.getAttribute('aria-controls');
          if (document.getElementById(listId)) return;
          const list = document.createElement('div'); list.id = listId; list.setAttribute('role', 'listbox');
          for (const caption of options) {
            const option = document.createElement('div'); option.setAttribute('role', 'option'); option.textContent = caption;
            option.addEventListener('click', event => {
              event.stopPropagation(); option.setAttribute('aria-selected', 'true');
              control.setAttribute('aria-valuetext', caption); control.setAttribute('aria-expanded', 'false');
            });
            list.append(option);
          }
          document.body.append(list);
        });
      }
      wireCombo('gender', ['Male', 'Female']);
      wireCombo('degree', ['Bachelor', 'Master', 'Doctor']);
      wireCombo('language-level', ['Beginner', 'Basic', 'Advanced', 'Expert']);
      document.querySelector('[name="resumeImportFile"]').addEventListener('change', () => { parseCount += 1; });
      document.querySelector('[name="PPtFileList"]').addEventListener('change', () => { portfolioCount += 1; });
      document.querySelector('[name="mobile"]').addEventListener('change', () => { smsPromptCount += 1; });
      document.getElementById('save-resume').addEventListener('click', () => { saveCount += 1; });
      document.getElementById('resume-editor').addEventListener('submit', event => { event.preventDefault(); submitCount += 1; });
      const value = name => document.querySelector('[name="' + name + '"]').value;
      const combo = id => document.getElementById(id).getAttribute('aria-valuetext') || '';
      window.__ctripGroundTruth = { read: () => ({
        basic: [value('name'), value('mobile'), value('email'), combo('gender'), value('birthday'), value('residenceState')],
        education: [combo('school'), combo('degree'), value('recruitEducationList[0].majorName'), value('recruitEducationList[0].startDate'), value('recruitEducationList[0].endDate'), value('recruitEducationList[0].description')],
        work: [value('recruitWorkingList[0].companyName'), value('recruitWorkingList[0].jobTitle'), value('recruitWorkingList[0].startDate'), value('recruitWorkingList[0].endDate'), document.querySelector('[name="recruitWorkingList[0].currentJob"]').checked, value('recruitWorkingList[0].description')],
        language: [value('recruitLanguageList[0].languageType'), combo('language-level')],
        skill: value('recruitSkillList[0].skillName'), certificate: value('recruitCertificateList[0].certificateName'),
        evaluation: value('evaluation'), smsCode: value('smsCode'), smsPromptCount,
        resumeImportCount: document.querySelector('[name="resumeImportFile"]').files.length,
        portfolioFileCount: document.querySelector('[name="PPtFileList"]').files.length,
        parseCount, portfolioCount, custom: value('enterprise.question'), saveCount, submitCount
      }) };
    </script>
  </body></html>`;
}
