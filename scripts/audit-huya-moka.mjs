import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const fixturePath = resolve(
  process.cwd(),
  "tests/fixtures/huya-moka-campus-candidate-resume-public-contract.json"
);
const groundTruthPath = resolve(
  process.cwd(),
  "ats-corpus/ground-truth/moka/huya/huya__campus-candidate-resume__v1.json"
);
const [expected, groundTruth] = await Promise.all([
  readFile(fixturePath, "utf8").then(JSON.parse),
  readFile(groundTruthPath, "utf8").then(JSON.parse)
]);

const sourceUrl = new URL(expected.sourceUrl);
assert.equal(sourceUrl.origin, expected.company.origin);
assert.equal(sourceUrl.pathname, "/campus_apply/huya/4112");
assert.equal(sourceUrl.hash, "#/candidateHome/resume");
assert.equal(expected.company.name, "虎牙直播");
assert.equal(expected.company.atsVendor, "Moka");

const fetched = [];
const requestHeaders = {
  accept: "text/html,application/xhtml+xml",
  "accept-language": "zh-CN,zh;q=0.9",
  "user-agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/140 Safari/537.36 qiuzhao-huya-moka-audit/1.0"
};
const firstResponse = await fetch(`${sourceUrl.origin}${sourceUrl.pathname}`, {
  method: "GET",
  redirect: "manual",
  headers: requestHeaders
});
fetched.push(new URL(firstResponse.url));
assert.equal(firstResponse.status, 302, "Moka public tenant bootstrap did not redirect");
const location = firstResponse.headers.get("location");
assert.ok(location, "Moka public tenant bootstrap omitted its location");

const cookieHeader = firstResponse.headers
  .getSetCookie()
  .map((cookie) => cookie.split(";", 1)[0])
  .join("; ");
assert.ok(cookieHeader, "Moka public tenant bootstrap omitted its anonymous session cookies");
const shellUrl = new URL(location, firstResponse.url);
const shellResponse = await fetch(shellUrl, {
  method: "GET",
  redirect: "manual",
  headers: { ...requestHeaders, cookie: cookieHeader }
});
fetched.push(new URL(shellResponse.url));
assert.equal(shellResponse.ok, true, `Moka public tenant shell returned ${shellResponse.status}`);
const shellHtml = await shellResponse.text();

const decodeHtmlAttribute = (value) =>
  value
    .replaceAll("&quot;", '"')
    .replaceAll("&#39;", "'")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&amp;", "&");
const rawInitData = shellHtml.match(
  /<input id="init-data" type="hidden" value="([\s\S]*?)"><script>/
)?.[1];
assert.ok(rawInitData, "Moka public shell did not expose init-data");
const initData = JSON.parse(decodeHtmlAttribute(rawInitData));

assert.equal(initData.org.id, expected.tenant.orgId);
assert.equal(initData.org.name, expected.company.name);
assert.equal(initData.org.displayName, expected.company.name);
assert.equal(initData.org.siteId, expected.tenant.siteId);
assert.equal(initData.org.siteName, expected.tenant.siteName);
assert.equal(initData.org.customTitle, expected.tenant.pageTitle);
assert.equal(initData.org.locale, expected.tenant.locale);
assert.equal(initData.org.websiteVersion, expected.tenant.websiteVersion);
assert.equal(initData.mode, expected.tenant.mode);
assert.equal(
  initData.backstageConfigVariables.usePreVisionStandardResume,
  expected.tenant.usePreviewStandardResume
);
assert.equal(
  initData.configVariables.hideWebsiteOnlineResume,
  expected.tenant.hideWebsiteOnlineResume
);
assert.match(shellHtml, /<title>虎牙直播-校园招聘<\/title>/);
assert.ok(shellHtml.includes("Moka，智能化招聘管理系统"));

const release = shellHtml.match(
  /id="moka-version"[^>]+data-version="([^"]+)"/
)?.[1];
assert.ok(release, "Moka public shell did not expose its release id");
const bundleUrlRaw = shellHtml.match(
  /src="(https:\/\/static-ats\.mokahr\.com\/apply-web\/javascripts\/applyWeb-[^"]+\.js)"/
)?.[1];
assert.ok(bundleUrlRaw, "Moka public shell did not reference applyWeb JavaScript");
const bundleUrl = new URL(bundleUrlRaw);
const bundleResponse = await fetch(bundleUrl, {
  method: "GET",
  headers: { "user-agent": requestHeaders["user-agent"] }
});
fetched.push(bundleUrl);
assert.equal(bundleResponse.ok, true, `Moka public applyWeb bundle returned ${bundleResponse.status}`);
const bundle = await bundleResponse.text();

assert.ok(bundle.includes(`path:"${expected.bundle.candidateRoute}"`));
assert.ok(bundle.includes(`to:"${expected.bundle.resumeRoute}"`));
assert.ok(bundle.includes(expected.bundle.loadEndpoint));
assert.ok(bundle.includes(expected.bundle.saveEndpoint));
assert.ok(
  bundle.includes('DEFAULT_APPLY_SETTING);return delete n.uploadInfo'),
  "candidate resume no longer copies DEFAULT_APPLY_SETTING and removes uploadInfo"
);
assert.ok(bundle.includes('submitButtonText:A._("保存")'));
assert.ok(bundle.includes('fetchCandidateInfoDirect)(t,n)'));
assert.ok(bundle.includes('put("/personal-center/resumeInfo")'));

const constantsModuleStart = bundle.indexOf("iJd5rU:function");
assert.ok(constantsModuleStart >= 0, "Moka constants module was not present");
const commonFieldsStart = bundle.indexOf("B=[", constantsModuleStart);
const defaultSettingStart = bundle.indexOf("U={", commonFieldsStart);
const defaultSettingEnd = bundle.indexOf("},Y=", defaultSettingStart) + 1;
assert.ok(commonFieldsStart > constantsModuleStart);
assert.ok(defaultSettingStart > commonFieldsStart);
assert.ok(defaultSettingEnd > defaultSettingStart);

const defaultSetting = JSON.parse(
  bundle
    .slice(defaultSettingStart + 2, defaultSettingEnd)
    .replaceAll("!0", "true")
    .replaceAll("!1", "false")
    .replace(/([,{])([A-Za-z][A-Za-z0-9]*):/g, '$1"$2":')
);
assert.equal(defaultSetting.uploadInfo.show, false);
assert.equal(expected.standardResumeContract.removedBlock, "uploadInfo");

const groups = expected.standardResumeContract.groups;
assert.deepEqual(
  Object.keys(defaultSetting).filter((groupKey) => groupKey !== "uploadInfo"),
  groups.map((group) => group.id)
);
for (let index = 0; index < groups.length; index += 1) {
  const group = groups[index];
  assert.equal(defaultSetting[group.id].show, true, `${group.id} is no longer shown`);
  assert.deepEqual(
    defaultSetting[group.id].isSelected,
    group.fields.map((field) => field.id),
    `${group.id} selected fields drifted`
  );
  assert.deepEqual(defaultSetting[group.id].isRequired ?? [], group.requiredIds);

  const groupMarker = `{id:"${group.id}",title:"${group.title}"`;
  const groupStart = bundle.indexOf(groupMarker, commonFieldsStart);
  const nextGroup = groups[index + 1];
  const groupEnd = nextGroup
    ? bundle.indexOf(`{id:"${nextGroup.id}",title:"${nextGroup.title}"`, groupStart)
    : defaultSettingStart;
  assert.ok(groupStart >= commonFieldsStart, `common field block missing: ${group.id}`);
  assert.ok(groupEnd > groupStart, `common field block boundary missing: ${group.id}`);
  const groupSource = bundle.slice(groupStart, groupEnd);
  assert.equal(groupSource.includes("multi:!0"), group.repeatable);
  const sourceFields = [...groupSource.matchAll(
    /\{id:"([^"]+)",name:"([^"]+)",type:"([^"]+)"/g
  )].map((match) => ({ id: match[1], name: match[2], type: match[3] }));
  for (const field of group.fields) {
    const sourceField = sourceFields.find((candidate) => candidate.id === field.id);
    assert.deepEqual(
      sourceField,
      { id: field.id, name: field.name, type: field.type },
      `${group.id}.${field.id} common-field definition drifted`
    );
  }
}

assert.ok(bundle.includes('k=["男","女"]'));
assert.ok(bundle.includes('A=["本科","硕士","博士","高中","大专","中专","MBA","其他"]'));
assert.ok(bundle.includes('x=[M._("一般"),M._("良好"),M._("熟练"),M._("精通")]'));
for (let year = 1; year <= 40; year += 1) {
  assert.ok(
    bundle.includes(`{label:M._("${year}年"),value:${year}}`),
    `Moka work-experience option ${year}年 drifted`
  );
}
assert.ok(bundle.includes('{label:O.student,value:-1}'));
assert.ok(bundle.includes('{label:O.graduate,value:0}'));
assert.ok(bundle.includes('{label:O.underOneYear,value:.5}'));

const fields = groups.flatMap((group) =>
  group.fields.map((field) => ({ ...field, required: group.requiredIds.includes(field.id) }))
);
const derivedDenominators = {
  groups: groups.length,
  logicalFields: fields.length,
  requiredFields: fields.filter((field) => field.required).length,
  repeatableGroups: groups.filter((group) => group.repeatable).length,
  configuredOptionFields: fields.filter((field) => field.optionCatalog).length,
  attachmentFields: fields.filter((field) => field.type.includes("upload")).length,
  identitySensitiveFields: fields.filter((field) => field.sensitive).length
};
assert.deepEqual(derivedDenominators, expected.denominators);
assert.deepEqual(groundTruth.denominators, expected.denominators);
assert.deepEqual(groundTruth.optionCatalogs, expected.optionCatalogs);

const normalizedFixtureGroups = groups.map((group) => ({
  groupKey: group.id,
  label: group.title,
  repeatable: group.repeatable,
  fields: group.fields.map((field) => ({
    fieldName: field.id,
    label: field.name,
    type: field.type,
    required: group.requiredIds.includes(field.id),
    optionCatalogId: field.optionCatalog ?? null,
    sensitive: Boolean(field.sensitive)
  }))
}));
const normalizedGroundTruthGroups = groundTruth.groups.map((group) => ({
  groupKey: group.groupKey,
  label: group.label,
  repeatable: group.repeatable,
  fields: group.fields.map((field) => ({
    fieldName: field.fieldName,
    label: field.label,
    type: field.type,
    required: field.required,
    optionCatalogId: field.optionCatalogId ?? null,
    sensitive: Boolean(field.sensitive)
  }))
}));
assert.deepEqual(normalizedGroundTruthGroups, normalizedFixtureGroups);

assert.equal(groundTruth.company.name, expected.company.name);
assert.equal(groundTruth.classification.atsFamily, "moka");
assert.equal(groundTruth.classification.kind, "shared-ats-tenant");
assert.equal(groundTruth.classification.vendor, expected.company.atsVendor);
assert.equal(groundTruth.source.pathTemplate, "/campus_apply/huya/:siteId");
assert.equal(groundTruth.source.hashRouteTemplate, expected.bundle.resumeRoute.replace(/^\//, "#/"));
assert.equal(groundTruth.evidence.evidenceType, expected.evidenceType);

const normalizedText = JSON.stringify(groundTruth).toLowerCase();
assert.equal(normalizedText.includes("4112"), false);
for (const prohibitedKey of [
  "currentValue",
  "cookie",
  "authToken",
  "filename",
  "rawHtml",
  "selector",
  "requestBody",
  "responseBody",
  "sessionId"
]) {
  assert.equal(
    normalizedText.includes(`\"${prohibitedKey.toLowerCase()}\"`),
    false,
    `normalized ground truth contains prohibited key ${prohibitedKey}`
  );
}

assert.equal(fetched.length, 3);
assert.equal(fetched[0].origin, expected.company.origin);
assert.equal(fetched[1].origin, expected.company.origin);
assert.equal(fetched[2].hostname, "static-ats.mokahr.com");
assert.ok(fetched[2].pathname.endsWith(".js"));

console.log(
  `Verified 虎牙直播 Moka campus standard resume public contract: ${derivedDenominators.groups} groups, ${derivedDenominators.logicalFields} logical fields, ${derivedDenominators.repeatableGroups} repeatable groups, GET-only and no candidateInfo/save/application request.`
);
