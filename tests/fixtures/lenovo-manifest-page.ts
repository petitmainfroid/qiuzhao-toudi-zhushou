export function lenovoManifestPage(): string {
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><title>匿名 Lenovo Talent 简历结构</title></head><body>
    <main><h1>匿名 Lenovo Talent 候选人简历</h1><form id="resume-editor">
      <section><h2>上传简历</h2>
        <label>简历附件 <input type="file" name="resumeAttachment" accept=".doc,.docx,.pdf"></label>
        <label>照片 <input type="file" name="resumeAvatar" accept=".jpg,.png"></label>
      </section>
      <section><h2>个人信息</h2>
        <label>姓 <input name="surname" value="manual-surname-private"></label>
        <label>名 <input name="givenName" value="manual-given-private"></label>
        <label>出生日期 <input name="birthday" value="1990/01"></label>
        <label>证件号码 <input name="certificateNo" value="identity-private"></label>
        <label>电子邮箱 <input type="email" name="email" value="page-email-private@example.test"></label>
        <label>手机号 <input name="phone" value="page-phone-private"></label>
        <label>微信号 <input name="wechat" value="manual-wechat-private"></label>
      </section>
      <section><h2>教育经历</h2>
        <label>学历 <div id="degree" class="el-select" role="combobox" name="educationExperiences[0].degree" aria-label="学历" aria-expanded="false" aria-controls="degree-options"></div></label>
        <label>培养方式 <div id="education-type" class="el-select" role="combobox" name="educationExperiences[0].cultivationMethod" aria-label="培养方式" aria-expanded="false" aria-controls="education-type-options"></div></label>
        <label>学校名称 <div id="school" class="el-select" role="combobox" name="educationExperiences[0].universityName" aria-label="学校名称" aria-expanded="false"></div></label>
        <label>专业 <input name="educationExperiences[0].major" value="page-major-private"></label>
        <label>入学时间 <input name="educationExperiences[0].enrollmentTime" value="2010/09"></label>
        <label>年级排名 <div id="ranking" class="el-select" role="combobox" name="educationExperiences[0].ranking" aria-label="年级排名" aria-expanded="false" aria-controls="ranking-options"></div></label>
      </section>
      <section><h2>实习经历</h2>
        <label>是否有实习经验 <div role="combobox" name="hasInternship" aria-label="是否有实习经验"></div></label>
        <label>工作单位 <input name="internExperiences[0].company" value="page-company-private"></label>
        <label>入职时间 <input name="internExperiences[0].entryTime" value="2015/01"></label>
        <label>职位 <input name="internExperiences[0].position" value="page-role-private"></label>
        <label>工作描述 <textarea name="internExperiences[0].roleResponsibility">page-work-description-private</textarea></label>
      </section>
      <section><h2>项目经验</h2>
        <label>是否有项目经验 <div role="combobox" name="hasProject" aria-label="是否有项目经验"></div></label>
        <label>项目名称 <input name="projectExperiences[0].projectName" value="page-project-private"></label>
        <label>项目职责 <input name="projectExperiences[0].roleResponsibility" value="page-project-role-private"></label>
        <label>项目描述 <textarea name="projectExperiences[0].projectIntrodution">page-project-description-private</textarea></label>
      </section>
      <section><h2>技能与爱好</h2>
        <label>英语等级 <div role="combobox" name="englishLevel" aria-label="英语等级"></div></label>
        <label>特长和爱好 <textarea name="strengthHobby">page-strength-private</textarea></label>
      </section>
      <section><h2>其他</h2>
        <label>信息来源 <div role="combobox" name="informationChannell" aria-label="信息来源"></div></label>
        <label>自我评价 <textarea name="selfEvaluation">page-self-private</textarea></label>
      </section>
      <label>企业自定义题 <input name="enterprise.question" value="custom-private"></label>
      <button id="save-resume" type="button">保存</button>
      <button type="submit">提交申请</button>
    </form></main>
    <script>
      let resumeEvents = 0; let saveCount = 0; let submitCount = 0;
      function wireCombo(id, options) {
        const control = document.getElementById(id);
        control.addEventListener('click', () => {
          control.setAttribute('aria-expanded', 'true');
          const listId = control.getAttribute('aria-controls');
          if (document.getElementById(listId)) return;
          const list = document.createElement('div'); list.id = listId; list.setAttribute('role', 'listbox');
          for (const caption of options) {
            const option = document.createElement('div'); option.className = 'el-select-dropdown__item';
            option.setAttribute('role', 'option'); option.textContent = caption;
            option.addEventListener('click', event => {
              event.stopPropagation(); option.setAttribute('aria-selected', 'true'); option.classList.add('is-selected');
              control.setAttribute('aria-valuetext', caption); control.setAttribute('aria-expanded', 'false');
            });
            list.append(option);
          }
          document.body.append(list);
        });
      }
      wireCombo('degree', ['Bachelor', 'Master', 'Doctor']);
      wireCombo('education-type', ['Full-time', 'Part-time']);
      wireCombo('ranking', ['Top 5%', 'Top 10%', 'Top 20%']);
      document.querySelector('[name="resumeAttachment"]').addEventListener('change', () => { resumeEvents += 1; });
      document.getElementById('save-resume').addEventListener('click', () => { saveCount += 1; });
      document.getElementById('resume-editor').addEventListener('submit', event => { event.preventDefault(); submitCount += 1; });
      const value = name => document.querySelector('[name="' + name + '"]').value;
      const combo = id => document.getElementById(id).getAttribute('aria-valuetext') || '';
      window.__lenovoGroundTruth = { read: () => ({
        resumeCount: document.querySelector('[name="resumeAttachment"]').files.length,
        resumeEvents,
        email: value('email'), phone: value('phone'),
        education: [combo('degree'), combo('education-type'), value('educationExperiences[0].major'), combo('ranking')],
        internship: [value('internExperiences[0].company'), value('internExperiences[0].position'), value('internExperiences[0].roleResponsibility')],
        project: [value('projectExperiences[0].projectName'), value('projectExperiences[0].roleResponsibility'), value('projectExperiences[0].projectIntrodution')],
        strengths: value('strengthHobby'), selfEvaluation: value('selfEvaluation'),
        surname: value('surname'), givenName: value('givenName'), birthday: value('birthday'),
        identity: value('certificateNo'), wechat: value('wechat'), school: combo('school'),
        educationStart: value('educationExperiences[0].enrollmentTime'),
        avatarCount: document.querySelector('[name="resumeAvatar"]').files.length,
        custom: value('enterprise.question'), saveCount, submitCount
      }) };
    </script>
  </body></html>`;
}
