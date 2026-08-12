import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const snapshotPath = resolve(process.cwd(), "tests/fixtures/metaapp-campus-application-schema.json");
const expected = JSON.parse(await readFile(snapshotPath, "utf8"));
const response = await fetch(expected.sourceUrl, {
  headers: { "user-agent": "qiuzhao-profile-assistant-field-audit/1.0" }
});
assert.equal(response.ok, true, `MetaApp page returned HTTP ${response.status}`);
const html = await response.text();
const rawWebsiteInfo = html.match(
  /<script id="js-websiteInfo" type="text\/json">([\s\S]*?)<\/script>/
)?.[1];
assert.ok(rawWebsiteInfo, "js-websiteInfo was not present in the MetaApp page HTML");

const website = JSON.parse(rawWebsiteInfo).website_info;
const groups = website.resume_form_schema.object_list
  .filter((group) => group.attributes?.visible !== false)
  .map((group) => ({
    group: group.attributes.i18n_name,
    fieldName: group.attributes.field_type?.name ?? "",
    required: Boolean(group.attributes.required),
    repeatable: Boolean(group.attributes.repeatable),
    children: (group.children ?? [])
      .filter((field) => field.attributes?.visible !== false)
      .map((field) => ({
        label: field.attributes.i18n_name,
        fieldName: field.attributes.field_type?.name ?? "",
        type: field.attributes.field_type?.type ?? "",
        required: Boolean(field.attributes.required)
      }))
  }));

assert.equal(website.path, expected.websitePath);
assert.equal(website.language, expected.language);
assert.equal(website.resume_form_schema.version, expected.schemaVersion);
assert.deepEqual(groups, expected.groups);

const jobResponse = await fetch(
  `https://meta.jobs.feishu.cn/api/v1/job/posts/${expected.job.id}`,
  { headers: { accept: "application/json" } }
);
assert.equal(jobResponse.ok, true, `MetaApp job API returned HTTP ${jobResponse.status}`);
const job = (await jobResponse.json()).data?.job_post_detail;
assert.equal(job?.title, expected.job.title);

const fieldCount = groups.reduce((total, group) => total + group.children.length, 0);
assert.equal(groups.length, 4);
assert.equal(fieldCount, 13);
console.log(
  `Verified MetaApp ${expected.job.title} schema: ${groups.length} groups, ${fieldCount} visible fields, GET-only and no application submission.`
);
