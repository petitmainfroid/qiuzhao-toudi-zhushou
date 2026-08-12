import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const snapshotPath = resolve(
  process.cwd(),
  "tests/fixtures/hesai-feishu-equipment-engineer-jiading-application-schema.json"
);
const expected = JSON.parse(await readFile(snapshotPath, "utf8"));
const sourceUrl = new URL(expected.sourceUrl);

assert.equal(sourceUrl.origin, expected.company.origin);
assert.equal(expected.company.id, "hesai-technology");
assert.equal(expected.company.name, "禾赛科技");
assert.equal(expected.company.legalName, "上海禾赛科技有限公司");

const response = await fetch(sourceUrl, {
  headers: { "user-agent": "qiuzhao-profile-assistant-hesai-ground-truth/1.0" }
});
assert.equal(response.ok, true, `Hesai application page returned HTTP ${response.status}`);
const html = await response.text();
const pageTitle = html.match(/<title>([\s\S]*?)<\/title>/)?.[1]?.trim();
assert.ok(pageTitle?.includes(expected.company.name), "page title did not identify 禾赛科技");

const rawWebsiteInfo = html.match(
  /<script id="js-websiteInfo" type="text\/json">([\s\S]*?)<\/script>/
)?.[1];
assert.ok(rawWebsiteInfo, "js-websiteInfo was not present in the Hesai application HTML");

const payload = JSON.parse(rawWebsiteInfo);
assert.equal(payload.tenant_info?.tenant_name, expected.company.legalName);
assert.ok(
  payload.website_info?.wechat_sharing_config?.title?.includes(expected.company.name),
  "public sharing title did not identify 禾赛科技"
);

const website = payload.website_info;
const groups = website.resume_form_schema.object_list
  .filter((group) => group.attributes?.visible !== false)
  .map((group) => ({
    group: group.attributes.i18n_name,
    fieldName: group.attributes.field_type?.name ?? null,
    customized: Boolean(group.attributes.is_customized),
    required: Boolean(group.attributes.required),
    repeatable: Boolean(group.attributes.repeatable),
    children: (group.children ?? [])
      .filter((field) => field.attributes?.visible !== false)
      .map((field) => ({
        label: field.attributes.i18n_name,
        fieldName: field.attributes.field_type?.name ?? null,
        type: field.attributes.field_type?.type ?? "",
        customized: Boolean(field.attributes.is_customized),
        required: Boolean(field.attributes.required),
        options: (field.attributes.field_type?.settings?.options ?? [])
          .filter((option) => option.active_status !== 0)
          .map((option) => option.i18n_name)
          .filter(Boolean)
      }))
  }));

assert.equal(website.path, expected.websitePath);
assert.equal(website.language, expected.language);
assert.equal(website.resume_form_schema.version, expected.schemaVersion);
assert.deepEqual(groups, expected.groups);

const jobResponse = await fetch(
  `${sourceUrl.origin}/api/v1/job/posts/${expected.job.id}`,
  { headers: { accept: "application/json" } }
);
assert.equal(jobResponse.ok, true, `Hesai job API returned HTTP ${jobResponse.status}`);
const job = (await jobResponse.json()).data?.job_post_detail;
assert.equal(job?.title, expected.job.title);

const fields = groups.flatMap((group) => group.children);
assert.equal(groups.length, 10);
assert.equal(fields.length, 30);
assert.equal(fields.filter((field) => field.customized).length, 1);
assert.equal(groups.filter((group) => group.repeatable).length, 7);
assert.equal(fields.filter((field) => field.type === "attachment").length, 2);

console.log(
  `Verified 禾赛科技（${expected.company.legalName}） ${expected.job.title}: ${groups.length} groups, ${fields.length} visible fields, GET-only and no application submission.`
);
