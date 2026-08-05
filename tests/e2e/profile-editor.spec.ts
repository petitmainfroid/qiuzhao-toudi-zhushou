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
  await page.getByRole("button", { name: "添加一段项目经历" }).click();
  await page.getByLabel("项目名称").fill("浏览器填表验证");
  await page.getByRole("button", { name: "保存档案" }).first().click();

  await expect(page.getByText(/已保存于/)).toBeVisible();
  await expect(page.getByRole("heading", { name: "常用回答" })).toBeVisible();
  await page.screenshot({ path: "artifacts/profile-editor.png", fullPage: true });
});
