import { expect, test } from "@playwright/test";

test("profile editor saves locally and exposes all sections", async ({ page }) => {
  await page.goto("/options.html");
  await page.evaluate(() => {
    localStorage.clear();
    localStorage.setItem("qiuzhao.privacyAcknowledged", "true");
  });
  await page.reload();

  await expect(page.getByRole("heading", { name: "只整理一次，之后专心检查。" })).toBeVisible();
  await page.getByLabel("姓名").fill("界面验证");
  await page.getByLabel("手机号码").fill("13800000000");
  await page.getByLabel("邮箱").fill("verify@example.test");
  await page.getByLabel("当前城市").fill("上海");
  await page.getByLabel("民族").fill("汉族");
  await page.getByLabel("证件类型").selectOption("居民身份证");
  await page.getByLabel("证件号码").fill("TEST-ID-000042");
  await page.getByRole("button", { name: "添加一段项目经历" }).click();
  await page.getByLabel("项目名称").fill("浏览器填表验证");
  await page.getByRole("button", { name: "添加一项证书" }).click();
  await page.getByLabel("证书名称").fill("CET-6");
  await page.getByRole("button", { name: "保存档案" }).first().click();

  await expect(page.getByText(/已保存于/)).toBeVisible();
  await expect(page.getByRole("heading", { name: "校园经历" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "证书信息" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "论文与专利" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "家庭与紧急联系人" })).toBeVisible();
  await expect(page.getByRole("note").filter({ hasText: "证件资料会保存在这台设备" })).toContainText("目前尚未加密");
  await expect(page.getByRole("note").filter({ hasText: "家庭成员资料涉及第三方隐私" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "常用问答", exact: true })).toBeVisible();

  await page.reload();
  await expect(page.getByLabel("民族")).toHaveValue("汉族");
  await expect(page.getByLabel("证件类型")).toHaveValue("居民身份证");
  await expect(page.getByLabel("证件号码")).toHaveValue("TEST-ID-000042");
  await expect(page.getByLabel("证书名称")).toHaveValue("CET-6");
  await page.screenshot({ path: "artifacts/profile-editor.png", fullPage: true });
});
