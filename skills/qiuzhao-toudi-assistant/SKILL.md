---
name: qiuzhao-toudi-assistant
description: Build, install, load, operate, and troubleshoot the local-first 秋招投递助手 Chrome/Edge extension. Use when a user asks Codex to install the extension, import a PDF/DOCX resume, authorize a recruitment tab, scan and compare form fields, create missing education/internship/project rows, selectively fill a recruitment page, diagnose activeTab access failures, or package the project without submitting an application or exposing credentials and personal data.
---

# 秋招投递助手

Operate the extension through its guarded user workflow. Keep all resume data local, require the user to authorize the current recruitment tab, and leave final submission to the user.

## Choose the workflow

### Install a published build

1. Direct the user to the repository Releases page.
2. Prefer `qiuzhao-toudi-assistant-bundle.zip`; use the extension-only ZIP when the Skill is already installed.
3. Ask the user to extract the archive.
4. Ask the user to open `chrome://extensions/` or `edge://extensions/`, enable developer mode, choose “加载已解压的扩展程序”, and select the directory containing `manifest.json`.
5. Do not claim that browser-internal installation confirmation can be automated.

### Build from source

1. Locate the repository root by finding `package.json`, `public/manifest.json`, and `AGENTS.md`.
2. Read `AGENTS.md`, `feature_list.json`, and the latest handoff in `progress.md` before changing code.
3. Run the bundled preparation script:

   ```powershell
   & '<skill-directory>\scripts\prepare-extension.ps1' -ProjectRoot '<repository-root>'
   ```

4. Report the resulting absolute `dist` path and guide the user through the manual browser loading steps.
5. Use `-Package` only when the user asks for distributable archives.

### Install this Skill from the repository

Run `npm run install:skill` from the repository root. If the target already exists, inspect it and request confirmation before rerunning with `npm run install:skill -- --force`. Ask the user to restart Codex after installation.

## Operate on a recruitment page

1. Ask the user to open the exact ordinary `http/https` recruitment form.
2. Require the user to click the extension icon while that tab is active. Treat this gesture as the grant of temporary `activeTab` access.
3. Scan the page before proposing mutations. Compare profile values with page structure and current values only through the extension's redacted comparison flow.
4. Present empty, consistent, and conflicting fields separately. Keep sensitive or conflicting fields unselected until the user confirms them.
5. If repeatable records are missing, create one bounded section-local group at a time, rescan after each structural change, and stop on count, fingerprint, or URL drift.
6. Fill only explicitly selected fields. Return control to the user for attachments, verification, final review, and submission.

## Import a resume

1. Use only a user-selected PDF or DOCX of at most 10 MB.
2. Keep the source file and extracted text in local extension memory; do not upload or persist them.
3. Merge evidence-backed values into empty profile fields and non-duplicate records.
4. Preserve existing non-empty values and leave uncertain or absent facts blank.
5. Ask the user to inspect the normal profile form and explicitly save it.

## Recover from access failures

For `Cannot access contents of the page` or “无法读取当前页面”:

1. Confirm the tab is an ordinary recruitment `http/https` page, not a browser settings page, extension store, internal PDF viewer, or inaccessible cross-origin frame.
2. Ask the user to return to the target page and click the extension icon again.
3. Rescan after the gesture. Repeat after navigation or refresh because `activeTab` may expire.
4. Do not add broad host permissions as a shortcut. Diagnose a truly unsupported site adapter separately.

## Enforce boundaries

- Never store or request recruitment-site passwords, Cookies, authentication tokens, verification codes, or identity credentials.
- Never bypass CAPTCHA, SMS verification, login, identity checks, or site risk controls.
- Never expose arbitrary browser clicks, arbitrary JavaScript execution, arbitrary filesystem paths, or generic file upload through an agent command.
- Never read or fill hidden, password, CAPTCHA, verification, identity-number, banking, or final-submit controls.
- Never click the final application submission control（最终提交）.
- Require confirmation for sensitive identity-adjacent fields and conflicts.
- Prefer deterministic field aliases and saved corrections; do not invent missing resume facts.
- Keep real resumes, extracted text, page values, screenshots with personal data, browser profiles, `.env` files, and auth artifacts out of Git and packages.

## Package and publish

1. Keep generated ZIP files ignored by Git.
2. Run `npm run package:release` to validate and create the extension, Skill, and combined archives.
3. Inspect archive entries and run a privacy scan before upload.
4. Publish source changes through a scoped branch and pull request. Upload generated archives as GitHub Release assets only when the user explicitly asks to publish.
5. Record exact commands, results, changed files, blockers, and the next feature in `progress.md`.

If any guard cannot be verified, stop before mutation and explain the exact user action or site adaptation required.
