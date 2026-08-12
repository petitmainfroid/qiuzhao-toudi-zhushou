import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const fixturePath = resolve(
  process.cwd(),
  "tests/fixtures/ctrip-experienced-edit-cv-public-bundle-contract.json"
);
const groundTruthPath = resolve(
  process.cwd(),
  "ats-corpus/ground-truth/ctrip-careers-custom/ctrip/ctrip__experienced-edit-cv__v1.json"
);

const [expected, groundTruth] = await Promise.all([
  readFile(fixturePath, "utf8").then(JSON.parse),
  readFile(groundTruthPath, "utf8").then(JSON.parse)
]);

const sourceUrl = new URL(expected.sourceUrl);
assert.equal(sourceUrl.origin, expected.company.origin);
assert.equal(sourceUrl.hash, "#/experienced/personal-homepage/editCV?tabindex=2");
assert.equal(expected.company.id, "ctrip-group");
assert.equal(expected.company.name, "携程集团");
assert.equal(expected.company.englishName, "Trip.com Group");
assert.deepEqual(expected.classification, {
  atsFamily: "ctrip-careers-custom",
  kind: "company-owned-custom-ats",
  sharedVendorTemplate: false
});

const fetchedUrls = [];
const fetchText = async (url, description) => {
  const resolved = new URL(url);
  fetchedUrls.push(resolved);
  const response = await fetch(resolved, {
    method: "GET",
    headers: { "user-agent": "qiuzhao-profile-assistant-ctrip-ground-truth/1.0" }
  });
  assert.equal(response.ok, true, `${description} returned HTTP ${response.status}`);
  return response.text();
};

const rootHtml = await fetchText(expected.company.origin, "Ctrip public recruitment root");
const description = rootHtml.match(
  /<meta\s+name="description"\s+content="([^"]*)"/i
)?.[1];
assert.equal(description, "携程招聘官网");
assert.ok(rootHtml.includes(expected.company.englishName));

const rawDictionary = rootHtml.match(
  /(?:window\.)?i18n_base_language\s*=\s*(\{[\s\S]*?\})\s*<\/script>/
)?.[1];
assert.ok(rawDictionary, "Ctrip public root did not expose i18n_base_language");
const dictionary = JSON.parse(rawDictionary);

for (const group of expected.groups) {
  if (group.i18nKey) {
    assert.equal(
      dictionary[group.i18nKey],
      group.label,
      `live i18n group label drifted for ${group.i18nKey}`
    );
  }
  for (const field of group.fields) {
    if (field.i18nKey) {
      assert.equal(
        dictionary[field.i18nKey],
        field.label,
        `live i18n field label drifted for ${field.i18nKey}`
      );
    }
  }
}
for (const [i18nKey, label] of Object.entries(expected.optionCatalogI18n)) {
  assert.equal(dictionary[i18nKey], label, `live option label drifted for ${i18nKey}`);
}

const mainAsset = rootHtml.match(
  /<script[^>]+src="([^"]*main\.[^"]+\.js)"/i
)?.[1];
assert.ok(mainAsset, "Ctrip public root did not reference the main JavaScript asset");
const resolveAsset = (asset) =>
  new URL(asset.startsWith("//") ? `https:${asset}` : asset, expected.company.origin);
const mainUrl = resolveAsset(mainAsset);
const mainBundle = await fetchText(mainUrl, "Ctrip public main bundle");

assert.ok(
  mainBundle.includes(
    `path:"${expected.route.protectedPath}",component:Zh,auth:!0`
  ),
  "experienced personal-homepage route is no longer marked as authenticated"
);
assert.ok(
  mainBundle.includes(`n.e(${expected.bundleContract.chunkId})`),
  "personal-homepage lazy chunk id drifted"
);
assert.ok(
  mainBundle.includes(`n.bind(n,${expected.bundleContract.moduleId})`),
  "personal-homepage module id drifted"
);
assert.ok(
  mainBundle.includes("passport.ctrip.com"),
  "authenticated-route redirect boundary was not present"
);

const publicPath = rootHtml.match(/\.p="([^"]+)"/)?.[1];
assert.ok(publicPath, "Ctrip runtime public path was not present");
const publicBase = resolveAsset(publicPath);
const resolveChunkUrl = (chunkId) => {
  const chunkHash = rootHtml.match(
    new RegExp(`(?:^|,)${chunkId}:"([^"]+)"`)
  )?.[1] ?? rootHtml.match(new RegExp(`${chunkId}:"([^"]+)"`))?.[1];
  assert.ok(chunkHash, `Ctrip chunk hash was not present for ${chunkId}`);
  return new URL(`static/js/${chunkId}.${chunkHash}.chunk.js`, publicBase);
};
const personalChunkUrl = resolveChunkUrl(expected.bundleContract.chunkId);
const personalBundle = await fetchText(
  personalChunkUrl,
  "Ctrip public personal-homepage bundle"
);
const sharedApiBundle = await fetchText(
  resolveChunkUrl(expected.bundleContract.sharedApiChunkId),
  "Ctrip public shared recruitment API bundle"
);

assert.ok(
  personalBundle.includes(`${expected.bundleContract.moduleId}:`),
  "expected personal-homepage module was not present in its lazy chunk"
);
assert.ok(
  personalBundle.includes(`path:"${expected.route.editPath}"`),
  "experienced edit-CV route was not present"
);
assert.ok(
  personalBundle.includes(`"${expected.route.recruitmentType}"`),
  "social-recruitment load contract was not present"
);

for (const endpoint of [
  ...expected.endpointMarkers.readOnly,
  ...expected.endpointMarkers.neverInvokedByAudit
]) {
  assert.ok(
    `${personalBundle}\n${sharedApiBundle}`.includes(endpoint),
    `bundle endpoint marker drifted: ${endpoint}`
  );
}

const sourceFieldNames = new Set();
const sourceMarkers = new Set();
for (const group of expected.groups) {
  if (group.collectionName) sourceFieldNames.add(group.collectionName);
  for (const field of group.fields) {
    if (field.fieldName !== "resumeImportFile") sourceFieldNames.add(field.fieldName);
    for (const name of field.relatedFieldNames ?? []) sourceFieldNames.add(name);
    if (field.collectionName) sourceFieldNames.add(field.collectionName);
    for (const marker of field.sourceMarkers ?? []) sourceMarkers.add(marker);
    for (const option of field.options ?? []) sourceMarkers.add(option.value);
  }
}
for (const fieldName of sourceFieldNames) {
  assert.ok(personalBundle.includes(fieldName), `bundle field marker drifted: ${fieldName}`);
}
for (const marker of sourceMarkers) {
  assert.ok(personalBundle.includes(marker), `bundle behavior marker drifted: ${marker}`);
}
assert.ok(personalBundle.includes('".pdf"'));
assert.ok(personalBundle.includes('".doc"'));
assert.ok(personalBundle.includes('".docx"'));
assert.match(personalBundle, /\.size\/1024\/1024>25/);

const fields = expected.groups.flatMap((group) => group.fields);
const repeatableCollections = new Set(
  expected.groups
    .flatMap((group) => [
      group.collectionName,
      ...group.fields.map((field) => field.collectionName)
    ])
    .filter(Boolean)
);
const derivedDenominators = {
  groups: expected.groups.length,
  logicalFields: fields.length,
  requiredFields: fields.filter((field) => field.required).length,
  repeatableCollections: repeatableCollections.size,
  attachmentFields: fields.filter((field) => field.type === "attachment").length,
  configuredOptionFields: fields.filter((field) => (field.options ?? []).length > 0).length,
  manualVerificationGates: fields.filter((field) => field.manualGate).length
};
assert.deepEqual(derivedDenominators, expected.denominators);
assert.deepEqual(groundTruth.denominators, expected.denominators);

const contractSignature = (groups) =>
  groups.map((group) => ({
    groupKey: group.groupKey,
    label: group.label,
    i18nKey: group.i18nKey ?? null,
    collectionName: group.collectionName ?? null,
    required: group.required,
    repeatable: group.repeatable,
    fields: group.fields.map((field) => ({
      label: field.label,
      i18nKey: field.i18nKey ?? null,
      collectionName: field.collectionName ?? null,
      fieldName: field.fieldName,
      inputName: field.inputName ?? null,
      relatedFieldNames: field.relatedFieldNames ?? [],
      type: field.type,
      required: field.required,
      options: field.options ?? [],
      accept: field.accept ?? [],
      maxSizeMb: field.maxSizeMb ?? null,
      multiple: field.multiple ?? null,
      hasManualGate: Boolean(field.manualGate)
    }))
  }));

assert.equal(groundTruth.company.name, expected.company.name);
assert.equal(groundTruth.company.englishName, expected.company.englishName);
assert.deepEqual(groundTruth.classification, {
  ...expected.classification,
  basis: groundTruth.classification.basis
});
assert.equal(groundTruth.source.originPattern, expected.company.origin);
assert.equal(groundTruth.source.hashRouteTemplate, "#/experienced/personal-homepage/editCV?tabindex=:tab");
assert.equal(groundTruth.evidence.evidenceType, expected.evidenceType);
assert.equal(groundTruth.evidence.routeRequiresAuthentication, true);
assert.deepEqual(contractSignature(groundTruth.groups), contractSignature(expected.groups));

const normalizedGroundTruth = JSON.stringify(groundTruth);
assert.equal(normalizedGroundTruth.includes("tabindex=2"), false);
for (const prohibitedKey of [
  "currentValue",
  "cookie",
  "authToken",
  "filename",
  "rawHtml",
  "requestBody",
  "responseBody"
]) {
  assert.equal(
    normalizedGroundTruth.toLowerCase().includes(`\"${prohibitedKey.toLowerCase()}\"`),
    false,
    `normalized ground truth contains prohibited key ${prohibitedKey}`
  );
}

assert.equal(fetchedUrls.length, 4);
assert.equal(fetchedUrls[0].origin, expected.company.origin);
for (const assetUrl of fetchedUrls.slice(1)) {
  assert.ok(assetUrl.hostname.endsWith("tripcdn.cn"));
  assert.ok(assetUrl.pathname.endsWith(".js"));
}

console.log(
  `Verified 携程集团 experienced edit-CV public bundle contract: ${derivedDenominators.groups} groups, ${derivedDenominators.logicalFields} logical fields, ${derivedDenominators.repeatableCollections} repeatable collections, GET-only and no candidate API call or application submission.`
);
