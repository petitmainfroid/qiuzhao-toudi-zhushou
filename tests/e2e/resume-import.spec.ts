import { expect, test } from "@playwright/test";
import { strToU8, zipSync } from "fflate";

function escapeXml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function buildDocx(paragraphs: string[]): Buffer {
  const body = paragraphs
    .map((paragraph) => `<w:p><w:r><w:t xml:space="preserve">${escapeXml(paragraph)}</w:t></w:r></w:p>`)
    .join("");
  const documentXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
    <w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
      <w:body>${body}<w:sectPr /></w:body>
    </w:document>`;
  const contentTypes = `<?xml version="1.0" encoding="UTF-8"?>
    <Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
      <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml" />
      <Default Extension="xml" ContentType="application/xml" />
      <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml" />
    </Types>`;
  const relationships = `<?xml version="1.0" encoding="UTF-8"?>
    <Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
      <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml" />
    </Relationships>`;
  return Buffer.from(zipSync({
    "[Content_Types].xml": strToU8(contentTypes),
    "_rels/.rels": strToU8(relationships),
    "word/document.xml": strToU8(documentXml)
  }));
}

function escapePdfText(value: string): string {
  return value.replace(/([\\()])/g, "\\$1");
}

function buildPdf(lines: string[]): Buffer {
  const textCommands = lines.map((line, index) => `${index === 0 ? "72 740 Td" : "0 -18 Td"} (${escapePdfText(line)}) Tj`).join("\n");
  const stream = `BT\n/F1 12 Tf\n${textCommands}\nET`;
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    `<< /Length ${Buffer.byteLength(stream, "ascii")} >>\nstream\n${stream}\nendstream`
  ];
  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  objects.forEach((object, index) => {
    offsets.push(Buffer.byteLength(pdf, "ascii"));
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xrefOffset = Buffer.byteLength(pdf, "ascii");
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  offsets.slice(1).forEach((offset) => {
    pdf += `${String(offset).padStart(10, "0")} 00000 n \n`;
  });
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;
  return Buffer.from(pdf, "ascii");
}

async function openEmptyEditor(page: import("@playwright/test").Page) {
  await page.goto("/options.html");
  await page.evaluate(() => {
    localStorage.clear();
    localStorage.setItem("qiuzhao.privacyAcknowledged", "true");
  });
  await page.reload();
  await expect(page.getByRole("heading", { name: "上传简历，填入这张信息表" })).toBeVisible();
}

test("resume import fills the existing profile form from a local DOCX without silent overwrite", async ({ page }) => {
  const externalRequests: string[] = [];
  page.on("request", (request) => {
    if (!request.url().startsWith("http://127.0.0.1:4173")) externalRequests.push(request.url());
  });
  await openEmptyEditor(page);
  await page.getByLabel("当前城市").fill("杭州");

  const resume = buildDocx([
    "林晓舟",
    "手机：138 0013 8000 | 邮箱：lin.xiaozhou@example.com",
    "性别：女",
    "出生日期：2003年06月18日",
    "国籍：中国",
    "现居城市：上海",
    "求职意向：算法工程师",
    "意向城市：上海、北京",
    "身份证号：320000200306180000",
    "内部解析标记-RAW-ONLY",
    "教育经历",
    "2022.09 - 2026.06 上海交通大学 计算机科学与技术 本科 统招全日制",
    "GPA：3.82/4.0；专业排名：前 10%",
    "2020.09 - 2022.06 苏州中学 高中",
    "实习经历",
    "2025.06 - 2025.09 星云科技有限公司 算法工程师实习生",
    "部门：推荐系统组",
    "构建离线评估流程，将实验准备时间缩短 35%。",
    "2024.07 - 2024.09 青禾研究院 研究助理",
    "复现实验并整理可核验结论。",
    "项目经历",
    "2024.10 - 2025.03 校园招聘匹配系统 项目负责人",
    "设计可解释的规则匹配与置信度分层。",
    "项目成果：覆盖 40 类中英文招聘字段。",
    "2023.10 - 2024.03 本地档案检查工具 核心成员",
    "实现字段级完整性检查与记录顺序校验。",
    "项目成果：形成匿名回归样本。",
    "语言能力",
    "英语 CET-6 无障碍沟通",
    "自我评价",
    "重视事实与边界，习惯用测试验证结果。"
  ]);
  await page.getByLabel("上传简历并解析").setInputFiles({
    name: "campus-resume.docx",
    mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    buffer: resume
  });

  await expect(page.getByText(/已识别 \d+ 项，填入 \d+ 项/)).toBeVisible();
  await expect(page.getByText(/保留了 1 个已有非空值/)).toBeVisible();
  await expect(page.getByLabel("姓名")).toHaveValue("林晓舟");
  await expect(page.getByLabel("手机号码")).toHaveValue("13800138000");
  await expect(page.getByLabel("邮箱")).toHaveValue("lin.xiaozhou@example.com");
  await expect(page.getByLabel("当前城市")).toHaveValue("杭州");
  await expect(page.getByLabel("证件类型")).toHaveValue("居民身份证");
  await expect(page.getByLabel("证件号码")).toHaveValue("320000200306180000");
  const educationCards = page.locator("#education article.repeat-card");
  await expect(educationCards).toHaveCount(2);
  await expect(educationCards.nth(0).getByLabel("院校名称")).toHaveValue("上海交通大学");
  await expect(educationCards.nth(0).getByLabel("专业", { exact: true })).toHaveValue("计算机科学与技术");
  await expect(educationCards.nth(1).getByLabel("院校名称")).toHaveValue("苏州中学");
  await expect(educationCards.nth(1).locator("select").nth(0)).toHaveValue("高中");

  const workCards = page.locator("#work article.repeat-card");
  await expect(workCards).toHaveCount(2);
  await expect(workCards.nth(0).getByLabel("公司名称")).toHaveValue("星云科技有限公司");
  await expect(workCards.nth(0).getByLabel("岗位名称")).toHaveValue("算法工程师实习生");
  await expect(workCards.nth(0).getByLabel("工作描述")).toHaveValue(/缩短 35%/);
  await expect(workCards.nth(1).getByLabel("公司名称")).toHaveValue("青禾研究院");
  await expect(workCards.nth(1).getByLabel("岗位名称")).toHaveValue("研究助理");
  await expect(workCards.nth(1).getByLabel("开始时间")).toHaveValue("2024-07");

  const projectCards = page.locator("#projects article.repeat-card");
  await expect(projectCards).toHaveCount(2);
  await expect(projectCards.nth(0).getByLabel("项目名称")).toHaveValue("校园招聘匹配系统");
  await expect(projectCards.nth(0).getByLabel("承担角色")).toHaveValue("项目负责人");
  await expect(projectCards.nth(0).getByLabel("项目成果")).toHaveValue(/覆盖 40 类/);
  await expect(projectCards.nth(1).getByLabel("项目名称")).toHaveValue("本地档案检查工具");
  await expect(projectCards.nth(1).getByLabel("承担角色")).toHaveValue("核心成员");
  await expect(projectCards.nth(1).getByLabel("项目成果")).toHaveValue(/匿名回归样本/);
  await expect(page.getByRole("combobox", { name: "语言", exact: true })).toHaveValue("英语");
  await expect(page.getByRole("heading", { name: "解析结果" })).toHaveCount(0);
  await expect(page.getByText("有未保存的更改")).toHaveCount(2);
  expect(await page.evaluate(() => localStorage.getItem("qiuzhao.candidateProfile"))).toBeNull();

  await page.getByRole("button", { name: "保存档案" }).first().click();
  await expect(page.getByText(/已保存于/)).toBeVisible();
  const stored = await page.evaluate(() => localStorage.getItem("qiuzhao.candidateProfile") ?? "");
  expect(stored).toContain("林晓舟");
  expect(stored).not.toContain("campus-resume.docx");
  expect(stored).not.toContain("RAW-ONLY");
  expect(stored).toContain('"identityDocumentNumber":"320000200306180000"');
  expect(externalRequests).toEqual([]);
  await page.screenshot({ path: "artifacts/resume-import.png", fullPage: true });
});

test("resume import extracts a text PDF locally", async ({ page }) => {
  await openEmptyEditor(page);
  const resume = buildPdf([
    "Alice Chen",
    "13800138001",
    "alice.chen@example.com",
    "Current city: Beijing",
    "Education Background",
    "2022.09 - 2026.06 Tsinghua University Computer Science Bachelor"
  ]);
  await page.getByLabel("上传简历并解析").setInputFiles({
    name: "english-resume.pdf",
    mimeType: "application/pdf",
    buffer: resume
  });

  await expect(page.getByText(/PDF，1 页\s+已在本机完成解析/)).toBeVisible({ timeout: 30_000 });
  await expect(page.getByLabel("姓名")).toHaveValue("Alice Chen");
  await expect(page.getByLabel("邮箱")).toHaveValue("alice.chen@example.com");
  await expect(page.getByLabel("院校名称")).toHaveValue("Tsinghua University");
  await expect(page.getByRole("textbox", { name: "专业", exact: true })).toHaveValue("Computer Science");
});

test("bundled local OCR recognizes Chinese section headings without a network request", async ({ page }) => {
  test.setTimeout(2 * 60 * 1000);
  const externalRequests: string[] = [];
  page.on("request", (request) => {
    if (!request.url().startsWith("http://127.0.0.1:4173")) externalRequests.push(request.url());
  });
  await page.goto("/options.html");
  const result = await page.evaluate(async () => {
    const modulePath = "/src/resume/extractResumeText.ts";
    const { recognizeCanvasWithLocalOcr } = await import(/* @vite-ignore */ modulePath);
    const canvas = document.createElement("canvas");
    canvas.width = 1200;
    canvas.height = 240;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("canvas unavailable");
    context.fillStyle = "white";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.fillStyle = "black";
    context.font = "64px sans-serif";
    context.fillText("科研经历 实习经历 项目经历", 40, 140);
    return (await recognizeCanvasWithLocalOcr(canvas)).replace(/\s/g, "");
  });

  expect(result).toContain("科研经历");
  expect(result).toContain("实习经历");
  expect(result).toContain("项目经历");
  expect(externalRequests).toEqual([]);
});
