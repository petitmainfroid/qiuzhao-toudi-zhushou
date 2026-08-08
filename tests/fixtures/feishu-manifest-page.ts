export function feishuManifestPage(): string {
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><title>匿名飞书结构</title></head><body>
    <main><h1>匿名飞书招聘结构</h1><form id="application">
      <div data-form-field-name="basic_info.name" data-form-field-i18n-name="姓名"><input value="page-name-must-not-leak"></div>
      <div data-form-field-name="basic_info.email" data-form-field-i18n-name="邮箱"><input type="email" value="private@example.test"></div>
      <div data-form-field-name="basic_info.gender" data-form-field-i18n-name="性别"><div id="gender-combobox" role="combobox" aria-expanded="false" aria-controls="gender-options"></div></div>
      <div data-form-field-name="education_list[0].school" data-form-field-i18n-name="学校名称"><input value="page-school-must-not-leak"></div>
      <div class="atsx-date-picker-period" data-form-field-name="education_list[0].start_end_time" data-form-field-i18n-name="起止时间">
        <input type="month" value="2020-09"><input type="month" value="2024-06">
      </div>
      <div data-form-field-name="attachment_resume_list.attachment_resume" data-form-field-i18n-name="简历附件">
        <button type="button">synthetic-private-resume.pdf 上次上传 : 2026-08-08 12:34 更新 删除</button>
        <input type="file" accept="application/pdf,.pdf">
      </div>
      <section id="project-records"><div data-form-field-name="project_list[0]">
        <div data-form-field-name="project_list[0].name" data-form-field-i18n-name="项目名称"><input value="page-project-must-not-leak"></div>
      </div></section>
      <div data-form-field-name="project_list"><button id="add-project" type="button">新增项目经历</button></div>
      <div data-form-field-name="custom_fields[0].answer" data-form-field-i18n-name="企业自定义题"><input value="custom-must-not-leak"></div>
      <button type="submit">提交简历</button>
    </form></main>
    <script>
      let submitCount = 0; let addCount = 0; let saveCount = 0; let resumeEvents = 0;
      const gender = document.querySelector('#gender-combobox');
      gender.addEventListener('click', () => {
        gender.setAttribute('aria-expanded', 'true');
        if (document.querySelector('#gender-options')) return;
        const list = document.createElement('div'); list.id = 'gender-options'; list.setAttribute('role', 'listbox');
        for (const caption of ['Male', 'Female']) {
          const option = document.createElement('div'); option.setAttribute('role', 'option'); option.textContent = caption;
          option.addEventListener('click', event => {
            event.stopPropagation(); option.setAttribute('aria-selected', 'true'); gender.setAttribute('aria-valuetext', caption);
            gender.setAttribute('aria-expanded', 'false');
          });
          list.append(option);
        }
        document.body.append(list);
      });
      document.querySelector('#add-project').addEventListener('click', () => {
        if (document.querySelector('[data-form-field-name="project_list[1]"]')) return;
        addCount += 1;
        const record = document.createElement('div'); record.setAttribute('data-form-field-name', 'project_list[1]');
        const field = document.createElement('div'); field.setAttribute('data-form-field-name', 'project_list[1].name'); field.setAttribute('data-form-field-i18n-name', '项目名称');
        const input = document.createElement('input'); input.value = 'new-project-initial'; field.append(input); record.append(field);
        const save = document.createElement('button'); save.type = 'button'; save.textContent = '保存';
        save.addEventListener('click', () => { saveCount += 1; save.remove(); }); record.append(save);
        document.querySelector('#project-records').append(record);
      });
      document.querySelector('input[type="file"]').addEventListener('change', () => { resumeEvents += 1; });
      document.querySelector('#application').addEventListener('submit', event => { event.preventDefault(); submitCount += 1; });
      window.__feishuManifestGroundTruth = { read: () => ({
        name: document.querySelector('[data-form-field-name="basic_info.name"] input').value,
        email: document.querySelector('[data-form-field-name="basic_info.email"] input').value,
        gender: gender.getAttribute('aria-valuetext') || '',
        school: document.querySelector('[data-form-field-name="education_list[0].school"] input').value,
        period: Array.from(document.querySelectorAll('[data-form-field-name="education_list[0].start_end_time"] input')).map(input => input.value),
        projects: Array.from(document.querySelectorAll('#project-records [data-form-field-name$=".name"] input')).map(input => input.value),
        resumeCount: document.querySelector('input[type="file"]').files.length,
        resumeEvents, addCount, saveCount,
        custom: document.querySelector('[data-form-field-name="custom_fields[0].answer"] input').value,
        submitCount
      }) };
    </script>
  </body></html>`;
}
