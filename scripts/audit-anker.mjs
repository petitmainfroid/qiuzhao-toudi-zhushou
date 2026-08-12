import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const snapshotPath = resolve(
  process.cwd(),
  "tests/fixtures/anker-innovations-feishu-ai-business-engineer-application-schema.json"
);
const groundTruthPath = resolve(
  process.cwd(),
  "ats-corpus/ground-truth/anker-innovations-feishu-ai-business-engineer-application-v1.json"
);
const [expected, groundTruth] = await Promise.all([
  readFile(snapshotPath, "utf8").then(JSON.parse),
  readFile(groundTruthPath, "utf8").then(JSON.parse)
]);
const detailUrl = new URL(expected.detailUrl);
const sourceUrl = new URL(expected.sourceUrl);

assert.equal(detailUrl.origin, expected.company.origin);
assert.equal(sourceUrl.origin, expected.company.origin);
assert.equal(expected.company.id, "anker-innovations");
assert.equal(expected.company.name, "安克创新");
assert.equal(expected.company.legalName, "安克创新科技股份有限公司");
assert.equal(expected.company.englishName, "Anker Innovations");
assert.match(detailUrl.pathname, /^\/index\/position\/\d+\/detail$/);
assert.match(sourceUrl.pathname, /^\/index\/resume\/\d+\/apply$/);
assert.ok(detailUrl.pathname.includes(expected.job.id));
assert.ok(sourceUrl.pathname.includes(expected.job.id));

const normalizeGroups = (website) =>
  website.resume_form_schema.object_list
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

const fetchWebsite = async (url, pageName) => {
  const response = await fetch(url, {
    headers: { "user-agent": "qiuzhao-profile-assistant-anker-ground-truth/1.0" }
  });
  assert.equal(response.ok, true, `Anker ${pageName} returned HTTP ${response.status}`);
  const html = await response.text();
  const rawWebsiteInfo = html.match(
    /<script id="js-websiteInfo" type="text\/json">([\s\S]*?)<\/script>/
  )?.[1];
  assert.ok(rawWebsiteInfo, `js-websiteInfo was not present in the Anker ${pageName}`);

  const payload = JSON.parse(rawWebsiteInfo);
  assert.equal(payload.tenant_info?.tenant_name, expected.company.englishName);
  assert.ok(
    payload.website_info?.wechat_sharing_config?.title?.includes(expected.company.legalName),
    `public sharing title on the ${pageName} did not identify 安克创新科技股份有限公司`
  );
  assert.equal(payload.website_info.path, expected.websitePath);
  assert.equal(payload.website_info.language, expected.language);
  assert.equal(payload.website_info.resume_form_schema.version, expected.schemaVersion);

  return { html, groups: normalizeGroups(payload.website_info) };
};

const [detail, application] = await Promise.all([
  fetchWebsite(detailUrl, "job-detail page"),
  fetchWebsite(sourceUrl, "application page")
]);
const detailTitle = detail.html.match(/<title>([\s\S]*?)<\/title>/)?.[1]?.trim();
assert.ok(detailTitle?.includes(expected.company.legalName));
assert.ok(detailTitle?.includes(expected.job.title));
assert.deepEqual(detail.groups, expected.groups);
assert.deepEqual(application.groups, expected.groups);
assert.deepEqual(detail.groups, application.groups);

const jobResponse = await fetch(
  `${sourceUrl.origin}/api/v1/job/posts/${expected.job.id}`,
  { headers: { accept: "application/json" } }
);
assert.equal(jobResponse.ok, true, `Anker job API returned HTTP ${jobResponse.status}`);
const job = (await jobResponse.json()).data?.job_post_detail;
assert.equal(job?.title, expected.job.title);

const fields = expected.groups.flatMap((group) => group.children);
assert.equal(expected.groups.length, 5);
assert.equal(fields.length, 15);
assert.equal(fields.filter((field) => field.customized).length, 0);
assert.equal(expected.groups.filter((group) => group.repeatable).length, 3);
assert.equal(fields.filter((field) => field.type === "attachment").length, 2);

assert.equal(groundTruth.company.name, expected.company.name);
assert.equal(groundTruth.company.legalName, expected.company.legalName);
assert.equal(groundTruth.company.englishName, expected.company.englishName);
assert.equal(groundTruth.source.originPattern, expected.company.origin);
assert.equal(groundTruth.source.positionPathTemplate, "/index/position/:id/detail");
assert.equal(groundTruth.source.pathTemplate, "/index/resume/:id/apply");
assert.equal(groundTruth.evidence.jobTitle, expected.job.title);
assert.deepEqual(groundTruth.denominators, {
  groups: 5,
  logicalFields: 15,
  customFields: 0,
  repeatableGroups: 3,
  attachmentFields: 2
});
assert.deepEqual(
  groundTruth.groups,
  expected.groups.map(({ group, children, ...groupAttributes }) => ({
    label: group,
    ...groupAttributes,
    fields: children.map(({ options, ...field }) =>
      options.length > 0 ? { ...field, options } : field
    )
  }))
);
assert.equal(JSON.stringify(groundTruth).includes(expected.job.id), false);

console.log(
  `Verified 安克创新（${expected.company.legalName}） ${expected.job.title}: ${expected.groups.length} groups, ${fields.length} visible fields, detail/application schemas equal, GET-only and no application submission.`
);
