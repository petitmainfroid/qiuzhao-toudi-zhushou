import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import ts from "typescript";

const snapshotPath = resolve(
  process.cwd(),
  "tests/fixtures/lenovo-talent-resume-schema.json"
);
const expected = JSON.parse(await readFile(snapshotPath, "utf8"));
const normalizedPath = resolve(
  process.cwd(),
  "ats-corpus/ground-truth/lenovo-talent/lenovo/lenovo__candidate-resume-editor__v1.json"
);
const normalized = JSON.parse(await readFile(normalizedPath, "utf8"));
const expectedGroups = new Map(expected.groups.map((group) => [group.group, group]));
const sectionLabels = new Set(expectedGroups.keys());

async function fetchText(url, init) {
  const response = await fetch(url, {
    ...init,
    headers: {
      "user-agent": "qiuzhao-profile-assistant-lenovo-ground-truth/1.0",
      ...init?.headers
    }
  });
  assert.equal(response.ok, true, `${url} returned HTTP ${response.status}`);
  return response.text();
}

function assetNames(source, pattern) {
  return [...new Set([...source.matchAll(pattern)].map((match) => match[1]))];
}

const html = await fetchText(expected.sourceUrl);
const indexAsset = html.match(/<script[^>]+src=["']([^"']*index-v[^"']+\.js)["']/i)?.[1];
assert.ok(indexAsset, "Lenovo production index asset was not present in the page HTML");
assert.match(indexAsset, new RegExp(expected.frontendBuild.replaceAll(".", "\\.")));

const indexUrl = new URL(indexAsset, expected.sourceUrl);
const indexSource = await fetchText(indexUrl);
const resumeComponentAssets = assetNames(
  indexSource,
  /["'](?:\.\/)?(assets\/myResume-v[^"']+\.js)["']/g
);
assert.equal(resumeComponentAssets.length, 2, "Expected one PC and one mobile myResume chunk");

const resumeComponents = await Promise.all(
  resumeComponentAssets.map(async (asset) => ({
    asset,
    source: await fetchText(new URL(`/${asset}`, expected.sourceUrl))
  }))
);
const pcComponent = resumeComponents.find(({ source }) => source.includes("el-form-item"));
const mobileComponent = resumeComponents.find(({ source }) => source.includes("van-field"));
assert.ok(pcComponent, "PC Element Plus myResume component was not found");
assert.ok(mobileComponent, "Mobile Vant myResume component was not found");
assert.match(pcComponent.asset, new RegExp(expected.frontendBuild.replaceAll(".", "\\.")));

const resumeApiAsset = assetNames(
  indexSource,
  /["'](?:\.\/)?(assets\/resume-v[^"']+\.js)["']/g
)?.[0];
const configAsset = assetNames(
  indexSource,
  /["'](?:\.\/)?(assets\/config-v[^"']+\.js)["']/g
)?.[0];
assert.ok(resumeApiAsset, "Resume API chunk was not found");
assert.ok(configAsset, "Static option-set chunk was not found");
const [resumeApiSource, configSource] = await Promise.all([
  fetchText(new URL(`/${resumeApiAsset}`, expected.sourceUrl)),
  fetchText(new URL(`/${configAsset}`, expected.sourceUrl))
]);

function propertyName(node, sourceFile) {
  if (ts.isIdentifier(node) || ts.isStringLiteralLike(node)) return node.text;
  return node.getText(sourceFile);
}

function scalarValue(node, sourceFile) {
  if (!node) return undefined;
  if (ts.isStringLiteralLike(node)) return node.text;
  if (ts.isNumericLiteral(node)) return Number(node.text);
  if (node.kind === ts.SyntaxKind.TrueKeyword) return true;
  if (node.kind === ts.SyntaxKind.FalseKeyword) return false;
  if (node.kind === ts.SyntaxKind.NullKeyword) return null;
  if (
    ts.isPrefixUnaryExpression(node) &&
    node.operator === ts.SyntaxKind.ExclamationToken &&
    ts.isNumericLiteral(node.operand)
  ) {
    return node.operand.text === "0";
  }
  return node.getText(sourceFile);
}

function objectProperties(node, sourceFile) {
  const result = {};
  for (const property of node.properties) {
    if (!ts.isPropertyAssignment(property)) continue;
    result[propertyName(property.name, sourceFile)] = scalarValue(
      property.initializer,
      sourceFile
    );
  }
  return result;
}

function hasRequiredRule(array, sourceFile) {
  return array.elements.some((element) => {
    if (!ts.isObjectLiteralExpression(element)) return false;
    return element.properties.some(
      (property) =>
        ts.isPropertyAssignment(property) &&
        propertyName(property.name, sourceFile) === "required" &&
        scalarValue(property.initializer, sourceFile) === true
    );
  });
}

function extractSectionSetups(source) {
  const sourceFile = ts.createSourceFile(
    "lenovo-myResume.js",
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.JS
  );
  assert.equal(sourceFile.parseDiagnostics.length, 0, "PC myResume chunk did not parse");
  const sections = new Map();

  function collectStringLiterals(root) {
    const values = new Set();
    function visit(node) {
      if (ts.isStringLiteralLike(node)) values.add(node.text);
      ts.forEachChild(node, visit);
    }
    visit(root);
    return values;
  }

  function findSectionLabel(root) {
    let result;
    function visit(node) {
      if (result) return;
      if (
        ts.isPropertyAssignment(node) &&
        propertyName(node.name, sourceFile) === "label" &&
        ts.isStringLiteralLike(node.initializer) &&
        sectionLabels.has(node.initializer.text)
      ) {
        result = node.initializer.text;
        return;
      }
      ts.forEachChild(node, visit);
    }
    visit(root);
    return result;
  }

  function inspectSetup(setup) {
    const componentIdentifiers = new Map();
    const controls = [];
    const requiredRuleKeys = new Set();

    function discover(node) {
      if (
        ts.isVariableDeclaration(node) &&
        ts.isIdentifier(node.name) &&
        node.initializer &&
        ts.isCallExpression(node.initializer) &&
        node.initializer.arguments.length === 1 &&
        ts.isStringLiteralLike(node.initializer.arguments[0]) &&
        /^el-(input|select|date-picker|form-item|upload|checkbox|radio-group)$/.test(
          node.initializer.arguments[0].text
        )
      ) {
        componentIdentifiers.set(node.name.text, node.initializer.arguments[0].text);
      }
      if (
        ts.isPropertyAssignment(node) &&
        ts.isArrayLiteralExpression(node.initializer) &&
        hasRequiredRule(node.initializer, sourceFile)
      ) {
        requiredRuleKeys.add(propertyName(node.name, sourceFile));
      }
      ts.forEachChild(node, discover);
    }
    discover(setup);

    function collectControls(node) {
      if (
        ts.isCallExpression(node) &&
        node.arguments.length >= 2 &&
        ts.isIdentifier(node.arguments[0]) &&
        componentIdentifiers.has(node.arguments[0].text) &&
        ts.isObjectLiteralExpression(node.arguments[1])
      ) {
        const properties = objectProperties(node.arguments[1], sourceFile);
        const modelText = properties.modelValue;
        const model =
          typeof modelText === "string"
            ? modelText.match(/(?:\.value|\b[A-Za-z_$][\w$]*)\.([A-Za-z_$][\w$]*)$/)?.[1]
            : undefined;
        controls.push({
          component: componentIdentifiers.get(node.arguments[0].text),
          model,
          properties
        });
      }
      ts.forEachChild(node, collectControls);
    }
    collectControls(setup);
    return {
      controls,
      requiredRuleKeys,
      strings: collectStringLiterals(setup),
      source: setup.getText(sourceFile)
    };
  }

  function visit(node) {
    if (
      ts.isMethodDeclaration(node) &&
      propertyName(node.name, sourceFile) === "setup"
    ) {
      const sectionLabel = findSectionLabel(node);
      if (sectionLabel) sections.set(sectionLabel, inspectSetup(node));
    }
    ts.forEachChild(node, visit);
  }
  visit(sourceFile);
  return sections;
}

const observedSections = extractSectionSetups(pcComponent.source);
assert.deepEqual(
  [...observedSections.keys()].sort(),
  [...sectionLabels].sort(),
  "PC component section set changed"
);

const expectedControl = {
  text: "el-input",
  email: "el-input",
  long_text: "el-input",
  select: "el-select",
  remote_select: "el-select",
  radio: "el-radio-group",
  month: "el-date-picker"
};

let profileFieldCount = 0;
let workflowControlCount = 0;
for (const group of expected.groups) {
  const observed = observedSections.get(group.group);
  assert.ok(observed, `Missing PC section ${group.group}`);
  for (const marker of group.apiMarkers) {
    assert.ok(resumeApiSource.includes(marker), `Missing API marker ${marker}`);
  }
  for (const field of group.fields) {
    profileFieldCount += 1;
    const renderedLabel = field.renderedLabel ?? field.label;
    if (renderedLabel) {
      assert.ok(
        observed.strings.has(renderedLabel) ||
          (field.compositeLabel && observed.strings.has(field.compositeLabel)),
        `${group.group}.${field.fieldName} label changed from ${renderedLabel}`
      );
    }
    if (field.condition) {
      assert.ok(
        observed.source.includes(field.condition.field),
        `${group.group}.${field.fieldName} condition source changed`
      );
      if (field.condition.optionLabel) {
        assert.ok(observed.strings.has(field.condition.optionLabel));
      }
    }
    if (field.evidenceModel) {
      const matches = observed.controls.filter(
        (control) => control.model === field.evidenceModel
      );
      const occurrence = field.occurrence ?? 1;
      assert.ok(
        matches.length >= occurrence,
        `${group.group}.${field.fieldName} model ${field.evidenceModel} was not rendered`
      );
      const control = matches[occurrence - 1];
      assert.equal(
        control.component,
        expectedControl[field.type],
        `${group.group}.${field.fieldName} control family changed`
      );
      if (field.type === "long_text") {
        assert.equal(control.properties.type, "textarea");
      }
      if (field.type === "email") assert.equal(control.properties.type, "email");
      if (field.type === "month") {
        assert.equal(control.properties.type, "month");
        assert.equal(control.properties["value-format"], field.valueFormat);
      }
      if (field.multiple) {
        assert.ok(Object.hasOwn(control.properties, "multiple"));
        assert.equal(control.properties["multiple-limit"], field.maxSelections);
      }
      if (field.desktopMultipleAttribute) {
        assert.ok(Object.hasOwn(control.properties, "multiple"));
      }
      if (
        field.required &&
        !field.requiredEvidence &&
        !field.requiredScope
      ) {
        assert.ok(
          observed.requiredRuleKeys.has(field.evidenceModel),
          `${group.group}.${field.fieldName} lost required validation`
        );
      }
    } else {
      assert.ok(
        observed.source.includes(field.evidenceMarker),
        `${group.group}.${field.fieldName} static marker changed`
      );
    }
  }
  for (const workflow of group.workflowControls ?? []) {
    workflowControlCount += 1;
    const control = observed.controls.find(
      (candidate) =>
        candidate.model === workflow.fieldName && candidate.component === "el-checkbox"
    );
    assert.ok(control, `${group.group}.${workflow.fieldName} workflow control changed`);
    assert.ok(observed.strings.has(workflow.label));
  }
}

assert.equal(profileFieldCount, expected.denominators.profileFields);
assert.equal(workflowControlCount, expected.denominators.workflowControls);
assert.equal(observedSections.size, expected.denominators.groups);
assert.deepEqual(normalized.denominators, {
  groups: expected.denominators.groups,
  logicalFields: expected.denominators.profileFields,
  workflowControls: expected.denominators.workflowControls,
  remoteOptionSets: expected.denominators.referencedRemoteOptionSets,
  staticOptionSets: expected.denominators.staticOptionSets
});
for (const expectedGroup of expected.groups) {
  const normalizedGroup = normalized.groups.find(
    (candidate) => candidate.label === expectedGroup.group
  );
  assert.ok(normalizedGroup, `Normalized ground truth lost ${expectedGroup.group}`);
  assert.equal(normalizedGroup.required, expectedGroup.required);
  assert.equal(normalizedGroup.repeatable, expectedGroup.repeatable);
  assert.deepEqual(
    normalizedGroup.fields.map(({ fieldName, type, required }) => ({
      fieldName,
      type,
      required
    })),
    expectedGroup.fields.map(({ fieldName, type, required }) => ({
      fieldName,
      type,
      required
    }))
  );
}

const dictionaryResponse = await fetch(
  "https://talent.lenovo.com.cn/gateway/sysDict/all",
  {
    headers: {
      accept: "application/json",
      "portal-type": "PC",
      "user-agent": "qiuzhao-profile-assistant-lenovo-ground-truth/1.0"
    }
  }
);
assert.equal(dictionaryResponse.ok, true, `Lenovo dictionary returned HTTP ${dictionaryResponse.status}`);
const dictionaryBody = await dictionaryResponse.json();
assert.equal(dictionaryBody.code, 0, "Lenovo dictionary API did not report success");

for (const optionSet of expected.remoteOptionSets) {
  const dictionary = dictionaryBody.result.find(
    (candidate) => candidate.dictCode === optionSet.dictCode
  );
  assert.ok(dictionary, `Missing Lenovo dictionary ${optionSet.dictCode}`);
  const visibleOptions = dictionary.children
    .filter((option) => !option.isHide)
    .map((option) => ({
      label: option.dictName,
      enLabel: option.dictEnName,
      value: option.dictValue
    }));
  const digest = createHash("sha256")
    .update(JSON.stringify(visibleOptions))
    .digest("hex");
  assert.equal(visibleOptions.length, optionSet.count, `${optionSet.dictCode} count changed`);
  assert.equal(digest, optionSet.sha256, `${optionSet.dictCode} options changed`);
  assert.equal(visibleOptions[0]?.label, optionSet.first);
  assert.equal(visibleOptions.at(-1)?.label, optionSet.last);
}

const configFile = ts.createSourceFile(
  "lenovo-config.js",
  configSource,
  ts.ScriptTarget.Latest,
  true,
  ts.ScriptKind.JS
);
const staticOptions = [];
function collectStaticOptions(node) {
  if (ts.isObjectLiteralExpression(node)) {
    const properties = objectProperties(node, configFile);
    if (
      typeof properties.label === "string" &&
      typeof properties.enLabel === "string" &&
      typeof properties.value === "number"
    ) {
      staticOptions.push({
        label: properties.label,
        enLabel: properties.enLabel,
        value: properties.value
      });
    }
  }
  ts.forEachChild(node, collectStaticOptions);
}
collectStaticOptions(configFile);
const expectedYesNo = expected.staticOptionSets.find((optionSet) => optionSet.id === "yes_no");
assert.deepEqual(staticOptions, expectedYesNo.options);
assert.equal(
  createHash("sha256").update(JSON.stringify(staticOptions)).digest("hex"),
  expectedYesNo.sha256
);

const artifactPaths = [
  snapshotPath,
  normalizedPath
];
for (const artifactPath of artifactPaths) {
  const artifact = await readFile(artifactPath, "utf8");
  assert.doesNotMatch(artifact, /<html|<form|<input|cookie\s*[:=]|authorization\s*[:=]|bearer\s+[\w.-]+/i);
  assert.doesNotMatch(artifact, /[?&](token|code|state|uid)=/i);
}

console.log(
  `Verified Lenovo Talent ${expected.surface}: ${observedSections.size} groups, ${profileFieldCount} profile fields, ${workflowControlCount} workflow controls, ${expected.remoteOptionSets.length} remote option sets; GET-only and no resume mutation or submission.`
);
