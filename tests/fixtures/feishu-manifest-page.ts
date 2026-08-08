export function feishuManifestPage(): string {
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><title>匿名飞书结构</title></head><body>
    <main><h1>匿名飞书招聘结构</h1><form id="application">
      <div data-form-field-name="basic_info.name" data-form-field-i18n-name="姓名"><input value="page-name-must-not-leak"></div>
      <div data-form-field-name="basic_info.email" data-form-field-i18n-name="邮箱"><input type="email" value="private@example.test"></div>
      <div data-form-field-name="basic_info.gender" data-form-field-i18n-name="性别"><div role="combobox" aria-expanded="false"></div></div>
      <div data-form-field-name="education_list[0].school" data-form-field-i18n-name="学校名称"><input value="page-school-must-not-leak"></div>
      <div data-form-field-name="attachment_resume_list.attachment_resume" data-form-field-i18n-name="简历附件">
        <button type="button">synthetic-private-resume.pdf 上次上传 : 2026-08-08 12:34 更新 删除</button>
        <input type="file" accept="application/pdf,.pdf">
      </div>
      <div data-form-field-name="custom_fields[0].answer" data-form-field-i18n-name="企业自定义题"><input value="custom-must-not-leak"></div>
      <button type="submit">提交简历</button>
    </form></main>
    <script>
      let submitCount = 0;
      document.querySelector('#application').addEventListener('submit', event => { event.preventDefault(); submitCount += 1; });
      window.__feishuManifestGroundTruth = { read: () => ({ submitCount }) };
    </script>
  </body></html>`;
}
