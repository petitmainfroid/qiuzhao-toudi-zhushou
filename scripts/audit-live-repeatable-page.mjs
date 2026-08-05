import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { platform } from "node:os";
import { dirname, join } from "node:path";

const repeatableGroups = [
  { key: "education_list", pathAliases: ["education_list", "education"], sectionClass: "resumeEditForm-education" },
  { key: "internship_list", pathAliases: ["internship_list", "internship"], sectionClass: "resumeEditForm-internship" },
  { key: "works_list", pathAliases: ["works_list", "works", "work"], sectionClass: "resumeEditForm-work" },
  { key: "project_list", pathAliases: ["project_list", "project"], sectionClass: "resumeEditForm-project" },
  { key: "award_list", pathAliases: ["award_list", "award"], sectionClass: "resumeEditForm-award" },
  { key: "language_list", pathAliases: ["language_list", "language"], sectionClass: "resumeEditForm-language" }
];

function argument(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function resolveOpenCli() {
  const lookup = spawnSync(platform() === "win32" ? "where.exe" : "which", ["opencli"], {
    encoding: "utf8",
    windowsHide: true
  });
  if (lookup.status !== 0) throw new Error("opencli is not installed or is not on PATH.");
  const paths = lookup.stdout.split(/\r?\n/).map((value) => value.trim()).filter(Boolean);
  if (platform() !== "win32") return { command: paths[0], prefix: [] };
  const command = paths.find((value) => value.toLowerCase().endsWith(".cmd"));
  const entrypoint = command
    ? join(dirname(command), "node_modules", "@jackwener", "opencli", "dist", "src", "main.js")
    : undefined;
  if (!entrypoint || !existsSync(entrypoint)) {
    throw new Error("The OpenCLI Node entrypoint could not be resolved safely.");
  }
  return { command: process.execPath, prefix: [entrypoint] };
}

function runOpenCli(args) {
  const executable = resolveOpenCli();
  const result = spawnSync(executable.command, [...executable.prefix, ...args], {
    encoding: "utf8",
    timeout: 20_000,
    windowsHide: true
  });
  if (result.status !== 0) {
    throw new Error((result.stderr || result.stdout || "OpenCLI command failed.").trim());
  }
  return result.stdout.trim();
}

function redactedLocation(rawUrl) {
  const url = new URL(rawUrl);
  return {
    origin: url.origin,
    pathPattern: url.pathname.replace(/\d{6,}/g, ":id"),
    queryKeys: [...url.searchParams.keys()].sort()
  };
}

const session = argument("--session");
const expectedOrigin = argument("--expected-origin");
const expectedPathPrefix = argument("--expected-path-prefix");
if (!session || !/^[a-zA-Z0-9_-]{1,64}$/.test(session)) {
  throw new Error("Pass a safe bound OpenCLI session with --session <name>.");
}
if (!expectedOrigin || !expectedPathPrefix) {
  throw new Error("Pass --expected-origin and --expected-path-prefix to bind the audit scope.");
}

const currentUrl = runOpenCli(["browser", session, "get", "url"]);
const parsedUrl = new URL(currentUrl);
if (parsedUrl.origin !== expectedOrigin || !parsedUrl.pathname.startsWith(expectedPathPrefix)) {
  throw new Error("The bound tab does not match the explicitly approved origin and path prefix.");
}

const pageExpression = `(() => {
  const groupDefinitions = ${JSON.stringify(repeatableGroups)};
  const structuralPathCandidates = [
    ...Array.from(document.querySelectorAll("[data-form-field-name]"))
      .map((element) => ({ source: "data-form-field-name", path: element.getAttribute("data-form-field-name") || "" })),
    ...Array.from(document.querySelectorAll("[data-cy]"))
      .map((element) => ({ source: "data-cy", path: element.getAttribute("data-cy") || "" }))
  ].filter(({ path }) => Boolean(path));
  const structuralPaths = Array.from(new Map(
    structuralPathCandidates.map((entry) => [entry.source + "::" + entry.path, entry])
  ).values());
  const parseIndex = (path, aliases) => {
    for (const alias of aliases) {
      const prefix = alias + "[";
      if (!path.startsWith(prefix)) continue;
      const remainder = path.slice(prefix.length);
      const closingBracket = remainder.indexOf("]");
      if (closingBracket < 1) continue;
      const indexText = remainder.slice(0, closingBracket);
      if (/^\\d+$/.test(indexText)) return Number(indexText);
    }
    return null;
  };
  const groups = Object.fromEntries(groupDefinitions.map((definition) => {
    const matches = structuralPaths.flatMap(({ source, path }) => {
      const index = parseIndex(path, definition.pathAliases);
      return Number.isInteger(index) ? [{ source, index }] : [];
    });
    const indexes = Array.from(new Set(matches.map(({ index }) => index)))
      .sort((left, right) => left - right);
    const sourceCounts = Object.fromEntries(
      Array.from(new Set(matches.map(({ source }) => source))).sort()
        .map((source) => [source, matches.filter((match) => match.source === source).length])
    );
    const sectionRoots = Array.from(document.querySelectorAll("." + definition.sectionClass));
    const addCandidates = Array.from(new Set(sectionRoots.flatMap((sectionRoot) =>
      Array.from(sectionRoot.querySelectorAll(".formOperate-addBtn, .createFormSection-addBtn"))
        .filter((element) => /^(\\u6dfb\\u52a0|\\u65b0\\u589e)$/.test(
          (element.textContent || "").replace(/\\s+/g, " ").trim()
        ))
    )));
    return [definition.key, {
      rowCount: indexes.length,
      indexes,
      fieldCount: matches.length,
      sourceCounts,
      sectionRootCount: sectionRoots.length,
      addCandidateCount: addCandidates.length,
      addCandidateFingerprints: addCandidates.map((element) => ({
        tag: element.tagName.toLowerCase(),
        classTokens: Array.from(element.classList).slice(0, 8).sort(),
        disabled: "disabled" in element ? Boolean(element.disabled) : false
      }))
    }];
  }));
  const submitControlCount = document.querySelectorAll("button[type='submit'], input[type='submit']").length
    + Array.from(document.querySelectorAll("button:not([type='submit'])"))
      .filter((element) => /(\\u63d0\\u4ea4|\\u6295\\u9012|\\u7533\\u8bf7)/.test(
        (element.textContent || "").trim()
      )).length;
  return {
    groups,
    structuralPathCount: structuralPaths.length,
    submitControlCount
  };
})()`;

const structuralResult = JSON.parse(runOpenCli(["browser", session, "eval", pageExpression]));

console.log(JSON.stringify({
  schemaVersion: 2,
  page: redactedLocation(currentUrl),
  repeatablePrefixes: repeatableGroups.map(({ key }) => key),
  ...structuralResult,
  safety: {
    boundSessionCreatedByAudit: false,
    inputValuesRead: false,
    pageMutationAttempted: false,
    addControlClicked: false,
    deleteControlClicked: false,
    submitControlClicked: false
  }
}, null, 2));
