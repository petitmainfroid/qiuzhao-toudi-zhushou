import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const snapshotPath = resolve(
  process.cwd(),
  "tests/fixtures/nio-feishu-senior-llm-algorithm-application-schema.json"
);
const expected = JSON.parse(await readFile(snapshotPath, "utf8"));
const sourceUrl = new URL(expected.sourceUrl);

assert.equal(sourceUrl.origin, expected.company.origin);
assert.equal(expected.company.id, "nio");
assert.equal(expected.company.name, "蔚来");

const response = await fetch(sourceUrl, {
  headers: { "user-agent": "qiuzhao-profile-assistant-nio-ground-truth/1.0" }
});
assert.equal(response.ok, true, `NIO application page returned HTTP ${response.status}`);
const html = await response.text();
const rawWebsiteInfo = html.match(
  /<script id="js-websiteInfo" type="text\/json">([\s\S]*?)<\/script>/
)?.[1];
assert.ok(rawWebsiteInfo, "js-websiteInfo was not present in the NIO application HTML");

const website = JSON.parse(rawWebsiteInfo).website_info;
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
assert.equal(jobResponse.ok, true, `NIO job API returned HTTP ${jobResponse.status}`);
const job = (await jobResponse.json()).data?.job_post_detail;
assert.equal(job?.title, expected.job.title);

const fieldCount = groups.reduce((total, group) => total + group.children.length, 0);
const customFieldCount = groups.reduce(
  (total, group) => total + group.children.filter((field) => field.customized).length,
  0
);
const configuredYesNoSelects = groups.flatMap((group) => group.children)
  .filter((field) => field.type === "select" && field.options.join("|") === "是|否");

assert.equal(groups.length, 7);
assert.equal(fieldCount, 27);
assert.equal(customFieldCount, 7);
assert.equal(configuredYesNoSelects.length, 3);

console.log(
  `Verified 蔚来（NIO） ${expected.job.title}: ${groups.length} groups, ${fieldCount} visible fields, ${customFieldCount} custom fields, GET-only and no application submission.`
);
