import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { platform } from "node:os";
import { dirname, join } from "node:path";

const MAX_SESSION_LENGTH = 64;

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
if (!session || session.length > MAX_SESSION_LENGTH || !/^[a-zA-Z0-9_-]+$/.test(session)) {
  throw new Error("Pass a safe bound OpenCLI session with --session <name>.");
}
if (!expectedOrigin || !expectedPathPrefix) {
  throw new Error("Pass --expected-origin and --expected-path-prefix to bind the audit scope.");
}

const currentUrl = runOpenCli(["browser", session, "get", "url"]);
const parsedUrl = new URL(currentUrl);
if (parsedUrl.protocol !== "https:" || parsedUrl.origin !== expectedOrigin || !parsedUrl.pathname.startsWith(expectedPathPrefix)) {
  throw new Error("The bound tab does not match the explicitly approved HTTPS origin and path prefix.");
}

const pageExpression = `(() => {
  const resumePattern = /(\\u7b80\\u5386|\\u4e2a\\u4eba\\u5c65\\u5386|resume|cv|curriculum\\s*vitae)/i;
  const forbiddenPattern = /(\\u8eab\\u4efd\\u8bc1|\\u8bc1\\u4ef6|\\u62a4\\u7167|\\u5934\\u50cf|\\u7167\\u7247|\\u6210\\u7ee9\\u5355|\\u4f5c\\u54c1\\u96c6|\\u63a8\\u8350\\u4fe1|\\u8d44\\u683c\\u8bc1|identity|passport|portrait|photo|transcript|portfolio|recommendation|certificate)/i;
  const clean = (value) => (value || "").replace(/\\s+/g, " ").trim();
  const controls = Array.from(document.querySelectorAll("input[type='file']"));
  const fileControls = controls.map((input) => {
    const wrapper = input.closest(".atsx-upload-btn, .atsx-upload-drag, .ud-upload, .ant-upload, .el-upload");
    const wrapperText = clean(wrapper?.textContent);
    const acceptTokens = input.accept.split(",").map((token) => token.trim().toLowerCase()).filter(Boolean).sort();
    const metadata = [
      input.getAttribute("aria-label"),
      input.getAttribute("placeholder"),
      input.getAttribute("name"),
      input.getAttribute("id"),
      input.getAttribute("data-form-field-name"),
      input.getAttribute("data-cy")
    ].map(clean);
    return {
      acceptTokens,
      acceptsPdf: acceptTokens.length === 0 || acceptTokens.includes(".pdf") || acceptTokens.includes("application/pdf"),
      multiple: Boolean(input.multiple),
      disabled: Boolean(input.disabled),
      metadataPresence: {
        ariaLabel: Boolean(metadata[0]),
        placeholder: Boolean(metadata[1]),
        name: Boolean(metadata[2]),
        domId: Boolean(metadata[3]),
        formField: Boolean(metadata[4]),
        dataCy: Boolean(metadata[5])
      },
      dataCyCategory: metadata[5] === "inputUpload" ? "inputUpload" : metadata[5] ? "other" : "none",
      wrapper: {
        found: Boolean(wrapper),
        classCategories: wrapper
          ? Array.from(wrapper.classList).map((token) => token.replace(/__[a-f0-9]+$/i, "__hash")).slice(0, 8).sort()
          : [],
        resumeSignal: resumePattern.test(wrapperText),
        forbiddenSignal: forbiddenPattern.test(wrapperText),
        textPresent: wrapperText.length > 0
      }
    };
  });
  const safeResumeCandidates = fileControls.filter((control) =>
    control.acceptsPdf && !control.multiple && !control.disabled
      && control.wrapper.resumeSignal && !control.wrapper.forbiddenSignal
  );
  const submitControlCount = Array.from(document.querySelectorAll("button, input[type='submit']"))
    .filter((element) => /(\\u63d0\\u4ea4|\\u6295\\u9012|\\u7533\\u8bf7)/.test(
      clean(element.textContent || element.value)
    )).length;
  return {
    fileControlCount: fileControls.length,
    safeResumeCandidateCount: safeResumeCandidates.length,
    fileControls,
    submitControlCount
  };
})()`;

const observation = JSON.parse(runOpenCli(["browser", session, "eval", pageExpression]));
const blockers = [];
if (observation.fileControlCount === 0) blockers.push("no-file-control");
if (observation.safeResumeCandidateCount === 0) blockers.push("no-safe-resume-candidate");
if (observation.safeResumeCandidateCount > 1) blockers.push("ambiguous-resume-candidates");

console.log(JSON.stringify({
  schemaVersion: 1,
  status: blockers.length === 0 ? "ready" : "blocked",
  page: redactedLocation(currentUrl),
  ...observation,
  blockers,
  safety: {
    boundSessionCreatedByAudit: false,
    inputValuesRead: false,
    existingFilenamesRead: false,
    pageTextPersisted: false,
    cookieReadAttempted: false,
    pageMutationAttempted: false,
    fileUploadAttempted: false,
    submitControlClicked: false,
    applicationSubmissionAttempted: false
  }
}, null, 2));
