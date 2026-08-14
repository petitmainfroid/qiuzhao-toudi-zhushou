# Built-in Browser Runtime Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make BossHunter self-contained for browser automation by bundling its own CDP runtime instead of depending on Claude Code `/web-access` at runtime.

**Architecture:** BossHunter keeps the existing Python `bosshunter.browser` facade, but the facade now ensures a bundled Node.js CDP proxy is running on the configured local port before each browser operation. The bundled runtime is adapted from the proven `/web-access` proxy, including Chrome port discovery, `DevToolsActivePort` WebSocket path handling, session reuse, and local debug-port guard.

**Tech Stack:** Python 3.10+, `httpx`, `rich`, Node.js CDP proxy (`.mjs`), Chrome remote debugging, Hatchling package data, `unittest`.

---

## File Structure

- Create `src/bosshunter/browser/client.py`: small HTTP client around runtime endpoints.
- Create `src/bosshunter/browser/runtime.py`: runtime config, path resolution, Node check, health check, process start, readiness wait.
- Create `src/bosshunter/browser/diagnostics.py`: user-facing diagnostics used by `bosshunter connect`.
- Create `src/bosshunter/browser/runtime/cdp-proxy.mjs`: bundled BossHunter CDP runtime adapted from `/web-access`.
- Create `src/bosshunter/browser/runtime/check-runtime.mjs`: optional standalone runtime check script.
- Create `src/bosshunter/browser/runtime/site-patterns/zhipin.com.md`: bundled BOSS直聘 runtime notes.
- Modify `src/bosshunter/browser/__init__.py`: keep public facade names and delegate to client/runtime.
- Modify `src/bosshunter/config.py`: add browser defaults.
- Modify `config.example.yaml`: document browser defaults.
- Modify `pyproject.toml`: include runtime `.mjs` and site-pattern package data.
- Modify `src/bosshunter/main.py`: make `bosshunter connect` run runtime diagnostics.
- Modify `src/bosshunter/pipeline.py`: show actionable runtime readiness errors.
- Modify `src/bosshunter/ai/resume.py`: use built-in runtime helpers for `/pdf` instead of hardcoded external proxy.
- Create `tests/test_browser_runtime.py`: runtime config/path/health/start behavior with mocks.
- Create `tests/test_browser_facade.py`: facade return handling with mocked runtime client.

---

### Task 1: Add browser runtime config defaults and packaging

**Files:**
- Modify: `src/bosshunter/config.py`
- Modify: `config.example.yaml`
- Modify: `pyproject.toml`
- Test: `tests/test_browser_runtime.py`

- [ ] Add `browser` defaults in `DEFAULTS`:

```python
"browser": {
    "runtime": "builtin",
    "proxy_host": "127.0.0.1",
    "proxy_port": 3456,
    "chrome_ports": [9222, 9229, 9333],
    "auto_start_proxy": True,
    "enable_port_guard": True,
    "site_patterns": True,
},
```

- [ ] Add matching `browser:` section to `config.example.yaml`.
- [ ] Add Hatchling wheel artifacts for:

```toml
[tool.hatch.build.targets.wheel]
packages = ["src/bosshunter"]
artifacts = [
    "src/bosshunter/browser/runtime/*.mjs",
    "src/bosshunter/browser/runtime/site-patterns/*.md",
]
```

- [ ] Add tests asserting `load_config()` includes `browser` defaults and merges overrides.

### Task 2: Bundle BossHunter CDP runtime files

**Files:**
- Create: `src/bosshunter/browser/runtime/cdp-proxy.mjs`
- Create: `src/bosshunter/browser/runtime/check-runtime.mjs`
- Create: `src/bosshunter/browser/runtime/site-patterns/zhipin.com.md`

- [ ] Copy the proven `/web-access` `cdp-proxy.mjs` into BossHunter runtime.
- [ ] Adapt runtime branding/log messages to `BossHunter Browser Runtime`.
- [ ] Make runtime configurable via environment variables:
  - `BOSSHUNTER_BROWSER_PROXY_PORT` / fallback `CDP_PROXY_PORT` / default `3456`
  - `BOSSHUNTER_CHROME_PORTS` / default `9222,9229,9333`
  - `BOSSHUNTER_ENABLE_PORT_GUARD` / default enabled
- [ ] Keep endpoints: `/health`, `/targets`, `/new`, `/close`, `/navigate`, `/back`, `/eval`, `/click`, `/clickAt`, `/type`, `/setFiles`, `/scroll`, `/screenshot`, `/pdf`, `/info`.
- [ ] Keep Chrome discovery, `DevToolsActivePort`, WebSocket path handling, flattened sessions, session reuse, and port guard.
- [ ] Create `check-runtime.mjs` for standalone Node/Chrome/proxy readiness checks.
- [ ] Copy `zhipin.com.md` site notes as product knowledge.
- [ ] Verify runtime scripts with `node --check`.

### Task 3: Add Python runtime manager and client

**Files:**
- Create: `src/bosshunter/browser/runtime.py`
- Create: `src/bosshunter/browser/client.py`
- Test: `tests/test_browser_runtime.py`

- [ ] Implement runtime path resolution with `importlib.resources.files("bosshunter.browser") / "runtime" / "cdp-proxy.mjs"` and filesystem fallback.
- [ ] Implement `set_browser_config(config)`, `get_browser_config(config=None)`, `get_runtime_url(config=None)`, `get_runtime_script_path()`.
- [ ] Implement `check_node_available()` using `subprocess.run(["node", "--version"], capture_output=True, text=True, timeout=5)`.
- [ ] Implement `runtime_health(config=None)` using `httpx.get(f"{url}/health", timeout=3)`.
- [ ] Implement `runtime_targets(config=None)` using `httpx.get(f"{url}/targets", timeout=5)`.
- [ ] Implement `start_runtime(config=None)` using `subprocess.Popen(["node", script_path], env=...)`, detached enough for CLI reuse.
- [ ] Implement `ensure_runtime(config=None)`:
  1. Return `True` when `/targets` returns a list.
  2. Return `False` when `browser.runtime != "builtin"` and no healthy runtime exists.
  3. Return `False` when Node is unavailable.
  4. Start runtime only if `browser.auto_start_proxy` is true.
  5. Poll `/targets` until ready or timeout.
- [ ] Implement `RuntimeClient` methods for all facade-needed endpoints.
- [ ] Test path resolution, config merging, URL construction, health/targets success/failure, and start env.

### Task 4: Refactor browser facade without changing public callers

**Files:**
- Modify: `src/bosshunter/browser/__init__.py`
- Test: `tests/test_browser_facade.py`

- [ ] Keep public names and return shapes:
  - `check_chrome_connection() -> dict | None`
  - `get_page_targets() -> list[dict]`
  - `find_boss_tab() -> dict | None`
  - `new_tab(url) -> str | None`
  - `close_tab(target_id) -> bool`
  - `navigate(target_id, url) -> bool`
  - `evaluate(target_id, expression, timeout=30) -> Any`
  - `click(target_id, selector) -> bool`
  - `scroll(target_id, y=0, direction="") -> bool`
  - `get_page_info(target_id) -> dict | None`
  - `wait_for_load(target_id, timeout=10) -> bool`
- [ ] Each operation calls `ensure_runtime()` before its runtime endpoint.
- [ ] Add `print_pdf(target_id, file_path) -> bool`, `screenshot(target_id, file_path) -> bool`, `click_at(target_id, selector_or_xy) -> bool`, `type_text(target_id, text) -> bool`, and `set_files(target_id, selector, files) -> bool` as extra supported facade helpers.
- [ ] Tests mock `ensure_runtime()` and `RuntimeClient` to verify return handling for `new_tab`, `evaluate`, `click`, `get_page_info`, and failure paths.

### Task 5: Wire diagnostics, CLI connect, pipeline, and resume PDF

**Files:**
- Create: `src/bosshunter/browser/diagnostics.py`
- Modify: `src/bosshunter/main.py`
- Modify: `src/bosshunter/pipeline.py`
- Modify: `src/bosshunter/ai/resume.py`

- [ ] Implement `run_browser_diagnostics(config=None) -> dict` with keys `node`, `runtime`, `chrome`, `targets`, `boss_tab`, `errors`, `runtime_url`.
- [ ] Implement `print_browser_diagnostics(config=None, console=None) -> bool` that prints:
  - `正在检测 Browser Runtime...`
  - Node available/missing
  - Runtime started/ready URL
  - Chrome connected/missing with setup instructions
  - BOSS直聘 tab found/missing
- [ ] Update `bosshunter connect` to call diagnostics.
- [ ] Update `run_pipeline()` browser readiness messages to use `check_chrome_connection()` result but mention Browser Runtime, not only raw Chrome port.
- [ ] Update `_render_pdf_via_cdp()` to call `new_tab(file_url)`, `print_pdf(target_id, output_path)`, and `close_tab(target_id)`.

### Task 6: Verify full implementation

**Files:**
- All modified files.

- [ ] Run Python compile check:

```bash
python -m compileall -q "/d/Ai项目/BossHunter-github/src" "/d/Ai项目/BossHunter-github/tests"
```

Expected: exit code 0.

- [ ] Run unit tests:

```bash
PYTHONPATH="/d/Ai项目/BossHunter-github/src" python -m unittest discover -s "/d/Ai项目/BossHunter-github/tests"
```

Expected: all tests pass.

- [ ] Run Node syntax checks:

```bash
node --check "/d/Ai项目/BossHunter-github/src/bosshunter/browser/runtime/cdp-proxy.mjs"
node --check "/d/Ai项目/BossHunter-github/src/bosshunter/browser/runtime/check-runtime.mjs"
```

Expected: no syntax errors.

- [ ] Run manual smoke when Chrome is available:

```bash
PYTHONPATH="/d/Ai项目/BossHunter-github/src" python -m bosshunter.main connect
```

Expected when Chrome remote debugging is enabled: Browser Runtime ready and targets listed. Expected when Chrome is unavailable: actionable Chrome setup instructions.

---

## Self-Review

- Spec coverage: runtime files, Chrome discovery, sessions, port guard, endpoint behavior, Python facade, CLI diagnostics, config, packaging, site notes, migration, error messages, and tests are covered.
- Placeholder scan: no `TBD`, `TODO`, `implement later`, or vague test-only instructions remain.
- Type consistency: `RuntimeClient`, `ensure_runtime`, `print_pdf`, `run_browser_diagnostics`, and facade helper names are used consistently across tasks.
