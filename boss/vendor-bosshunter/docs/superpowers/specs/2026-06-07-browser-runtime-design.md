# BossHunter Built-in Browser Runtime Design

## Purpose

BossHunter currently depends on an external Claude Code `/web-access` CDP proxy at `http://localhost:3456` for most browser operations. This makes the project difficult for ordinary users to run outside Claude Code, and the existing Python-side browser connection is not reliable enough in practice.

The goal is to make BossHunter self-contained for browser automation while preserving the working behavior already proven by `/web-access`:

- connect to the user's existing Chrome session and login state;
- keep BossHunter's current `new_tab`, `evaluate`, `click`, `scroll`, `close_tab`, `get_page_info`, and PDF workflow stable;
- include the same important runtime fallbacks that made `/web-access` usable: Chrome port discovery, `DevToolsActivePort` handling, WebSocket path handling, session reuse, and local debug-port guard;
- avoid requiring Claude Code or the `/web-access` skill at runtime.

## Non-goals

This runtime is not a general web-browsing agent framework. It should not bring over `/web-access` features that do not serve BossHunter directly:

- no WebSearch/WebFetch abstraction;
- no Claude Code skill instructions;
- no general multi-site browsing philosophy;
- no sub-agent orchestration;
- no broad site-pattern framework beyond BossHunter's BOSS直聘 needs.

## Current state

BossHunter's main browser interface is [src/bosshunter/browser/__init__.py](../../../src/bosshunter/browser/__init__.py). It exposes simple functions used by scraping, sending, monitoring, and PDF generation:

- `check_chrome_connection()`;
- `get_page_targets()`;
- `find_boss_tab()`;
- `new_tab(url)`;
- `close_tab(target_id)`;
- `navigate(target_id, url)`;
- `evaluate(target_id, expression, timeout=30)`;
- `click(target_id, selector)`;
- `scroll(target_id, y=0, direction="")`;
- `get_page_info(target_id)`;
- `wait_for_load(target_id, timeout=10)`.

Most of these functions call `http://localhost:3456`, which is supplied by the external `/web-access` CDP proxy. Only connection checking falls back to `http://localhost:9222/json/version`. The result is that `bosshunter run` can detect Chrome in some cases but still fail when it needs real page operations unless the external proxy is already running.

There is also [src/bosshunter/browser/session.py](../../../src/bosshunter/browser/session.py), which uses Patchright's `connect_over_cdp`, but it is not wired into the current scraping/sending/monitoring flows and does not include the proven `/web-access` fallbacks.

## Recommended architecture

BossHunter should embed a dedicated Node.js CDP runtime adapted from the working `/web-access` runtime, then have the Python browser layer automatically ensure that runtime is available. The implementation should preserve the proven behavior but remove Claude Code-specific skill concerns.

```text
BossHunter CLI / pipeline
  ↓
Python browser facade
  ↓ auto-start / health-check
Built-in BossHunter CDP Runtime on 127.0.0.1:3456
  ↓ WebSocket CDP
User's existing Chrome remote-debugging session
  ↓
BOSS直聘 pages with user login state
```

This keeps the proven `localhost:3456` API shape but changes ownership: `localhost:3456` becomes BossHunter's own bundled runtime, not Claude Code's skill runtime.

## Runtime files

Add a built-in runtime package under BossHunter:

```text
src/bosshunter/browser/
├── __init__.py          # public browser facade used by existing modules
├── client.py            # HTTP client for runtime endpoints
├── runtime.py           # ensure/start/check built-in runtime
├── diagnostics.py       # user-facing connection diagnostics
├── session.py           # keep or deprecate Patchright helper; not primary runtime
└── runtime/
    ├── cdp-proxy.mjs    # bundled CDP proxy adapted from /web-access
    ├── check-runtime.mjs# optional standalone runtime check script
    └── site-patterns/
        └── zhipin.com.md
```

The existing business modules should continue importing from `bosshunter.browser` so the implementation change stays localized.

## Runtime capabilities

The bundled `cdp-proxy.mjs` should preserve these `/web-access` capabilities because they are important for BossHunter reliability:

### Chrome discovery

- read `DevToolsActivePort` from common Chrome/Chromium profile locations on Windows, macOS, and Linux;
- use both the discovered port and the second-line WebSocket path when available;
- fall back to common ports: `9222`, `9229`, `9333`;
- avoid WebSocket probing during port checks to reduce unnecessary Chrome authorization prompts.

### CDP connection and sessions

- connect to Chrome's browser-level WebSocket;
- manage one WebSocket connection per runtime process;
- attach to targets with flattened sessions;
- reuse target sessions;
- clear session cache if Chrome disconnects;
- handle in-flight connection attempts with a shared promise to avoid duplicate connection races.

### Port guard

Enable Fetch interception per target session to fail requests to the active Chrome debug port:

- `http://127.0.0.1:<chromePort>/*`;
- `http://localhost:<chromePort>/*`.

This is a defensive anti-detection measure from `/web-access`. It should be enabled by default and configurable via `browser.enable_port_guard`.

### Page operations

Preserve the endpoint behavior BossHunter already depends on:

- `GET /health`;
- `GET /targets`;
- `GET /new?url=`;
- `GET /close?target=`;
- `GET /navigate?target=&url=`;
- `GET /back?target=`;
- `POST /eval?target=`;
- `POST /click?target=`;
- `GET /scroll?target=&y=&direction=`;
- `GET /info?target=`;
- `GET /pdf?target=&file=`.

Also keep the useful `/web-access` operations that support future BossHunter flows:

- `POST /clickAt?target=` for real mouse clicks;
- `POST /type?target=` for native text insertion;
- `POST /setFiles?target=` for file input upload;
- `GET /screenshot?target=&file=` for diagnostics.

## Python facade behavior

The Python browser layer should keep the existing public function names and return shapes. Each public browser operation should:

1. ensure the runtime is healthy or start it if configured to do so;
2. call the local runtime endpoint;
3. return the same kind of value current callers expect;
4. surface useful error messages when Chrome or the runtime is unavailable.

For example:

- `new_tab(url)` returns `targetId | None`;
- `evaluate(target_id, expression)` returns the endpoint's `value`;
- `click(target_id, selector)` returns `True/False`;
- `get_page_info(target_id)` returns `{title, url, ready}` or `None`.

This allows [src/bosshunter/scraper/jobs.py](../../../src/bosshunter/scraper/jobs.py), [src/bosshunter/executor/sender.py](../../../src/bosshunter/executor/sender.py), and [src/bosshunter/executor/monitor.py](../../../src/bosshunter/executor/monitor.py) to keep their current call patterns.

## CLI behavior

`bosshunter connect` should become the user-facing runtime check:

```text
正在检测 Browser Runtime...
✓ Node.js 可用
✓ Chrome 调试端口已发现: 9222
✓ BossHunter CDP Runtime 已启动: http://127.0.0.1:3456
✓ 已连接 Chrome
✓ 发现 BOSS直聘 页面
```

If Chrome is not available, it should provide direct setup instructions:

```text
未发现 Chrome 调试端口。
请打开 Chrome，访问 chrome://inspect/#remote-debugging，勾选 Allow remote debugging。
或使用: chrome.exe --remote-debugging-port=9222
```

`bosshunter run`, `scrape`, `send`, `monitor`, and resume PDF generation should auto-start/check the runtime before browser operations, so users do not need to run `bosshunter connect` manually first.

## Configuration

Add a `browser` section to `config.example.yaml` and configuration defaults:

```yaml
browser:
  runtime: "builtin"
  proxy_host: "127.0.0.1"
  proxy_port: 3456
  chrome_ports: [9222, 9229, 9333]
  auto_start_proxy: true
  enable_port_guard: true
  site_patterns: true
```

The defaults should support ordinary users without edits. Existing configurations without `browser` should continue to work through defaults.

## Site-specific behavior

Bundle the current verified `zhipin.com` site notes as product knowledge, not as an Agent skill instruction. The key runtime-relevant facts are:

- BOSS直聘 requires the user's login state;
- job detail URLs must preserve full parameters, especially `securityId`;
- batch tab opening should avoid opening many tabs at once;
- selectors such as `.text-experiece`, `.job-boss-info`, `.job-sec-text`, and `.sider-company` have known quirks.

This site knowledge should guide scraper/monitor code and diagnostics, not become a broad multi-site framework.

## Packaging

The Node runtime scripts must be included in the Python package distribution. Hatchling package data should include:

```text
src/bosshunter/browser/runtime/*.mjs
src/bosshunter/browser/runtime/site-patterns/*.md
```

Node.js remains a runtime prerequisite unless a future phase rewrites the proxy in Python. The README should clearly say BossHunter includes its own runtime but still requires Node.js for the bundled CDP proxy.

## Compatibility and migration

The migration should be incremental:

1. Add the bundled runtime files.
2. Add Python runtime ensure/check helpers.
3. Update [src/bosshunter/browser/__init__.py](../../../src/bosshunter/browser/__init__.py) to use the bundled runtime rather than assuming an external proxy.
4. Update [src/bosshunter/ai/resume.py](../../../src/bosshunter/ai/resume.py) PDF generation to use the same runtime helpers instead of hardcoding an external proxy.
5. Update CLI and docs.

Current business code should not need large changes.

## Error handling

Runtime failures should be explicit and actionable:

- Node missing: tell the user Node.js is required and show the detected state.
- Chrome debug port missing: show Chrome setup instructions.
- Proxy port occupied by unknown service: show the port and suggest changing `browser.proxy_port`.
- Chrome authorization pending: tell the user to approve the Chrome prompt and retry.
- Page target errors: include target id and endpoint in debug output.

Do not silently fall back to external Claude Code skill behavior.

## Testing and verification

Implementation should include unit tests for Python runtime behavior where practical:

- runtime path resolution;
- default config merging;
- health-check success/failure handling;
- process start command construction;
- browser facade return handling for `new_tab`, `evaluate`, `click`, and `get_page_info` using mocked HTTP responses.

Manual smoke verification should cover:

- `bosshunter connect` with Chrome remote debugging enabled;
- `bosshunter connect` when no Chrome debug port is available;
- `bosshunter scrape --limit 1` or an equivalent low-impact scrape smoke test;
- PDF generation path using built-in `/pdf` if available.

## Open implementation notes

- Keep port `3456` by default to minimize current code churn, but make it configurable.
- Keep Patchright dependency for now unless later cleanup proves it is unused; removing it is outside this runtime migration.
- The uncommitted README contributor change is unrelated to this runtime work and should be handled separately before committing implementation changes.
