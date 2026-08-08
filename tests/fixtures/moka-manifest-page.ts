export function mokaManifestPage(): string {
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><title>匿名 Moka 简历结构</title></head><body>
    <main><h1>匿名 Moka 候选人简历</h1><form id="resume-editor">
      <section><h2>个人信息</h2>
        <label>姓名 <input name="basicInfo.name" value="page-name-private"></label>
        <label>手机号码 <input name="basicInfo.phone" value="page-phone-private"></label>
        <label>邮箱 <input type="email" name="basicInfo.email" value="page-email-private@example.test"></label>
        <label>性别 <div id="gender" role="combobox" name="basicInfo.gender" aria-label="性别" aria-expanded="false" aria-controls="gender-options"></div></label>
        <label>出生日期 <input type="date" name="basicInfo.birthDate" value="1990-01-01"></label>
        <label>所在地 <input name="basicInfo.location" value="page-location-private"></label>
        <label>证件号码 <input name="basicInfo.citizenId" value="identity-private"></label>
      </section>
      <section><h2>求职意向</h2>
        <label>期望城市 <input name="jobIntention.forwardLocation" value="page-city-private"></label>
      </section>
      <section><h2>工作经历</h2>
        <label>公司名称 <input name="experienceInfo[0].company" value="manual-work-private"></label>
      </section>
      <section><h2>教育背景</h2>
        <label>开始时间 <input type="month" name="educationInfo[0].startDate" value="2010-01"></label>
        <label>结束时间 <input type="month" name="educationInfo[0].endDate" value="2014-01"></label>
        <label>学校名称 <input name="educationInfo[0].school" value="page-school-private"></label>
        <label>专业名称 <input name="educationInfo[0].speciality" value="page-major-private"></label>
        <label>学历 <div id="degree" role="combobox" name="educationInfo[0].academicDegree" aria-label="学历" aria-expanded="false" aria-controls="degree-options"></div></label>
      </section>
      <section><h2>实习经历</h2>
        <label>开始时间 <input type="month" name="practiceInfo[0].startDate" value="2015-01"></label>
        <label>结束时间 <input type="month" name="practiceInfo[0].endDate" value="2015-02"></label>
        <label>公司名称 <input name="practiceInfo[0].company" value="page-internship-private"></label>
        <label>职位名称 <input name="practiceInfo[0].title" value="page-role-private"></label>
        <label>工作职责 <textarea name="practiceInfo[0].summary">page-summary-private</textarea></label>
      </section>
      <section><h2>项目经验</h2>
        <label>开始时间 <input type="month" name="projectInfo[0].startDate" value="2016-01"></label>
        <label>结束时间 <input type="month" name="projectInfo[0].endDate" value="2016-02"></label>
        <label>项目名称 <input name="projectInfo[0].projectName" value="page-project-private"></label>
        <label>职务 <input name="projectInfo[0].title" value="page-project-role-private"></label>
        <label>项目描述 <textarea name="projectInfo[0].projectDescription">page-project-description-private</textarea></label>
        <label>项目中职责 <textarea name="projectInfo[0].responsibilities">manual-responsibilities-private</textarea></label>
      </section>
      <section><h2>语言能力</h2>
        <label>语言类型 <input name="languageInfo[0].language" value="page-language-private"></label>
        <label>掌握程度 <div id="language-level" role="combobox" name="languageInfo[0].level" aria-label="掌握程度" aria-expanded="false" aria-controls="language-level-options"></div></label>
        <label>听说 <div role="combobox" name="languageInfo[0].listenAndSpeak" aria-label="听说"></div></label>
      </section>
      <section><h2>自我描述</h2><label>自我描述 <textarea name="selfDescription.personal">page-self-private</textarea></label></section>
      <section><h2>获奖经历</h2>
        <label>获奖时间 <input type="date" name="awardInfo[0].awardDate" value="2017-01-01"></label>
        <label>奖项名称 <input name="awardInfo[0].awardName" value="page-award-private"></label>
      </section>
      <label>企业自定义题 <input name="customInfo.question" value="custom-private"></label>
      <button id="save-resume" type="button">保存</button>
      <button type="submit">提交申请</button>
    </form></main>
    <script>
      let saveCount = 0; let submitCount = 0;
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
      wireCombo('language-level', ['General', 'Good', 'Proficient', 'Expert']);
      document.getElementById('save-resume').addEventListener('click', () => { saveCount += 1; });
      document.getElementById('resume-editor').addEventListener('submit', event => { event.preventDefault(); submitCount += 1; });
      const value = name => document.querySelector('[name="' + name + '"]').value;
      const combo = id => document.getElementById(id).getAttribute('aria-valuetext') || '';
      window.__mokaGroundTruth = { read: () => ({
        basic: [value('basicInfo.name'), value('basicInfo.phone'), value('basicInfo.email'), combo('gender'), value('basicInfo.birthDate'), value('basicInfo.location')],
        preferredCity: value('jobIntention.forwardLocation'),
        education: [value('educationInfo[0].startDate'), value('educationInfo[0].endDate'), value('educationInfo[0].school'), value('educationInfo[0].speciality'), combo('degree')],
        internship: [value('practiceInfo[0].startDate'), value('practiceInfo[0].endDate'), value('practiceInfo[0].company'), value('practiceInfo[0].title'), value('practiceInfo[0].summary')],
        project: [value('projectInfo[0].startDate'), value('projectInfo[0].endDate'), value('projectInfo[0].projectName'), value('projectInfo[0].title'), value('projectInfo[0].projectDescription')],
        language: [value('languageInfo[0].language'), combo('language-level')],
        selfDescription: value('selfDescription.personal'),
        award: [value('awardInfo[0].awardDate'), value('awardInfo[0].awardName')],
        manualWork: value('experienceInfo[0].company'), identity: value('basicInfo.citizenId'),
        responsibilities: value('projectInfo[0].responsibilities'), custom: value('customInfo.question'),
        saveCount, submitCount
      }) };
    </script>
  </body></html>`;
}
