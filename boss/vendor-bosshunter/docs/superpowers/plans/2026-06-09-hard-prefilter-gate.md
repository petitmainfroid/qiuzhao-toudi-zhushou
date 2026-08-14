# Hard Prefilter Gate Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Convert BossHunter prefiltering from soft scoring to a hard gate that only rejects clear hard-fail jobs before LLM scoring.

**Architecture:** Keep the existing prefilter boundary in `bosshunter.ai.prefilter.quick_score(job, config)` and preserve the existing product decision that exclusion keywords are checked against the job title only. `quick_score()` will return `0` for hard reject and `100` for pass; `score_jobs()` will filter only when the returned quick score is `0` and will no longer read `scoring.prefilter_threshold`.

**Tech Stack:** Python 3.10+, `unittest`, YAML config, React/TypeScript ConfigPage source, JSON config schema.

---

## File Structure

- Modify `tests/test_regression_small_fixes.py`
  - Add regression tests for hard-gate prefilter behavior, config defaults/example config, frontend source, schema, and backend scorer source.
- Modify `src/bosshunter/ai/prefilter.py`
  - Replace soft scoring with hard-gate logic.
  - Keep exclusion keyword matching title-only.
  - Add internship/management-trainee hard reject controlled by `profile.allow_internship`.
  - Add salary-minimum hard reject.
- Modify `src/bosshunter/ai/scorer.py`
  - Remove `prefilter_threshold` read.
  - Filter prefilter failures only when `qs == 0`.
- Modify `src/bosshunter/config.py`
  - Add default `profile.allow_internship: False`.
  - Remove default `scoring.prefilter_threshold`.
- Modify `config.example.yaml`
  - Add `profile.allow_internship: false`.
  - Remove `scoring.prefilter_threshold`.
- Modify `src/bosshunter/web/config_schema.json`
  - Add `profile.allow_internship` switch immediately after `deal_breakers`.
  - Remove `scoring.prefilter_threshold` field.
- Modify `src/bosshunter/web/frontend/src/pages/ConfigPage.tsx`
  - Add `接受实习/管培岗位` switch below `排除关键词`.
  - Remove `预筛阈值` slider.

---

### Task 1: Add hard prefilter regression tests

**Files:**
- Modify: `tests/test_regression_small_fixes.py`
- Test: `tests/test_regression_small_fixes.py`

- [ ] **Step 1: Add failing tests to `tests/test_regression_small_fixes.py`**

Insert these test classes after `ConfigValidationTests` and before `ConfirmationUiTests`:

```python
class PrefilterHardGateTests(unittest.TestCase):
    def test_deal_breakers_still_match_title_only(self):
        from bosshunter.ai.prefilter import quick_score

        config = {"profile": {"deal_breakers": ["外包"], "salary_min": 0}}
        job = {"title": "AI产品经理", "jd": "非外包项目，团队稳定", "salary": "20-30K"}

        score, reason = quick_score(job, config)

        self.assertEqual(score, 100)
        self.assertEqual(reason, "预筛通过")

    def test_deal_breaker_in_title_is_filtered(self):
        from bosshunter.ai.prefilter import quick_score

        config = {"profile": {"deal_breakers": ["外包"], "salary_min": 0}}
        job = {"title": "AI产品经理 外包", "jd": "", "salary": "20-30K"}

        score, reason = quick_score(job, config)

        self.assertEqual(score, 0)
        self.assertEqual(reason, "触发排除词: 外包")

    def test_default_rejects_internship_titles(self):
        from bosshunter.ai.prefilter import quick_score

        config = {"profile": {"deal_breakers": [], "salary_min": 0}}
        job = {"title": "AI产品实习生", "jd": "", "salary": "3-5K"}

        score, reason = quick_score(job, config)

        self.assertEqual(score, 0)
        self.assertEqual(reason, "实习/管培岗位")

    def test_default_rejects_management_trainee_titles(self):
        from bosshunter.ai.prefilter import quick_score

        config = {"profile": {"deal_breakers": [], "salary_min": 0}}
        job = {"title": "产品管培生", "jd": "", "salary": "8-12K"}

        score, reason = quick_score(job, config)

        self.assertEqual(score, 0)
        self.assertEqual(reason, "实习/管培岗位")

    def test_allow_internship_lets_internship_titles_pass_prefilter(self):
        from bosshunter.ai.prefilter import quick_score

        config = {"profile": {"deal_breakers": [], "allow_internship": True, "salary_min": 0}}
        job = {"title": "AI Product Intern", "jd": "", "salary": "3-5K"}

        score, reason = quick_score(job, config)

        self.assertEqual(score, 100)
        self.assertEqual(reason, "预筛通过")

    def test_salary_below_minimum_is_filtered(self):
        from bosshunter.ai.prefilter import quick_score

        config = {"profile": {"deal_breakers": [], "salary_min": 100}}
        job = {"title": "AI产品经理", "jd": "", "salary": "12K"}

        score, reason = quick_score(job, config)

        self.assertEqual(score, 0)
        self.assertEqual(reason, "薪资低于硬性要求: 12K < 100K")

    def test_passing_job_returns_hard_gate_pass(self):
        from bosshunter.ai.prefilter import quick_score

        config = {"profile": {"deal_breakers": ["外包", "996"], "salary_min": 15}}
        job = {"title": "AI产品经理", "jd": "", "salary": "20-30K"}

        score, reason = quick_score(job, config)

        self.assertEqual(score, 100)
        self.assertEqual(reason, "预筛通过")
```

Add these methods to `ConfigExampleTests`:

```python
    def test_example_defaults_to_not_allowing_internships(self):
        config = yaml.safe_load((ROOT / "config.example.yaml").read_text(encoding="utf-8"))

        self.assertIs(config["profile"]["allow_internship"], False)

    def test_example_does_not_include_prefilter_threshold(self):
        config = yaml.safe_load((ROOT / "config.example.yaml").read_text(encoding="utf-8"))

        self.assertNotIn("prefilter_threshold", config["scoring"])
```

Add this method to `ConfigValidationTests`:

```python
    def test_load_config_defaults_to_not_allowing_internships(self):
        from bosshunter.config import load_config

        with tempfile.TemporaryDirectory() as tmp:
            config_path = Path(tmp) / "config.yaml"
            config_path.write_text("profile:\n  salary_min: 10\n", encoding="utf-8")

            config = load_config(config_path)

        self.assertIs(config["profile"]["allow_internship"], False)
        self.assertNotIn("prefilter_threshold", config["scoring"])
```

Insert this new test class after `DashboardPageTests`:

```python
class ConfigPageTests(unittest.TestCase):
    def setUp(self):
        self.source = (
            ROOT
            / "src"
            / "bosshunter"
            / "web"
            / "frontend"
            / "src"
            / "pages"
            / "ConfigPage.tsx"
        ).read_text(encoding="utf-8")

    def test_config_page_does_not_render_prefilter_threshold(self):
        self.assertNotIn("prefilter_threshold", self.source)
        self.assertNotIn("预筛阈值", self.source)

    def test_allow_internship_switch_appears_below_deal_breakers(self):
        deal_breakers_index = self.source.index("排除关键词")
        allow_internship_index = self.source.index("接受实习/管培岗位")

        self.assertGreater(allow_internship_index, deal_breakers_index)
        self.assertIn("profile.allow_internship", self.source)
```

Insert this new test class after `ConfigPageTests`:

```python
class ConfigSchemaTests(unittest.TestCase):
    def setUp(self):
        import json

        self.schema_source = (
            ROOT / "src" / "bosshunter" / "web" / "config_schema.json"
        ).read_text(encoding="utf-8")
        self.schema = json.loads(self.schema_source)

    def test_schema_does_not_include_prefilter_threshold(self):
        self.assertNotIn("prefilter_threshold", self.schema_source)

    def test_schema_adds_allow_internship_after_deal_breakers(self):
        profile = next(section for section in self.schema["sections"] if section["key"] == "profile")
        keys = [field["key"] for field in profile["fields"]]

        self.assertIn("allow_internship", keys)
        self.assertGreater(keys.index("allow_internship"), keys.index("deal_breakers"))

        allow_field = profile["fields"][keys.index("allow_internship")]
        self.assertEqual(allow_field["label"], "接受实习/管培岗位")
        self.assertEqual(allow_field["type"], "switch")
        self.assertIs(allow_field["default"], False)
```

Insert this new test class after `ConfigSchemaTests`:

```python
class ScorerPrefilterTests(unittest.TestCase):
    def setUp(self):
        self.source = (ROOT / "src" / "bosshunter" / "ai" / "scorer.py").read_text(encoding="utf-8")

    def test_scorer_no_longer_depends_on_prefilter_threshold(self):
        self.assertNotIn("prefilter_threshold", self.source)
        self.assertIn("if qs == 0:", self.source)
```

- [ ] **Step 2: Run the new regression test file and verify RED**

Run:

```bash
cd "D:/Ai项目/BossHunter-github" && PYTHONPATH="D:/Ai项目/BossHunter-github/src" python -m unittest "D:/Ai项目/BossHunter-github/tests/test_regression_small_fixes.py" -v
```

Expected result: FAIL. Expected failures include at least:

- `test_deal_breakers_still_match_title_only` fails because current `quick_score()` returns a soft score instead of `100`.
- `test_default_rejects_management_trainee_titles` fails because current logic does not reject `管培`.
- `test_example_defaults_to_not_allowing_internships` fails because `config.example.yaml` lacks `allow_internship`.
- `test_config_page_does_not_render_prefilter_threshold` fails because `ConfigPage.tsx` still contains `prefilter_threshold` and `预筛阈值`.
- `test_schema_does_not_include_prefilter_threshold` fails because `config_schema.json` still contains `prefilter_threshold`.
- `test_scorer_no_longer_depends_on_prefilter_threshold` fails because `scorer.py` still reads `prefilter_threshold`.

- [ ] **Step 3: Commit the failing tests if working with commits enabled**

Run only if the user has asked for commits in this execution session:

```bash
git -C "D:/Ai项目/BossHunter-github" add "tests/test_regression_small_fixes.py"
git -C "D:/Ai项目/BossHunter-github" commit -m "test: cover hard prefilter gate"
```

Expected result: commit succeeds. If no commit was requested, skip this step and leave tests unstaged.

---

### Task 2: Implement hard-gate prefilter logic

**Files:**
- Modify: `src/bosshunter/ai/prefilter.py`
- Test: `tests/test_regression_small_fixes.py`

- [ ] **Step 1: Replace `src/bosshunter/ai/prefilter.py` with hard-gate logic**

Replace the entire file with:

```python
"""Pre-filter module - hard gate filtering before LLM evaluation."""

import re


INTERNSHIP_KEYWORDS = ("实习", "intern", "internship", "管培")


def quick_score(job: dict, config: dict) -> tuple[int, str]:
    """Return a hard prefilter result.

    Returns:
    - (0, reason): hard rejection, do not call the LLM.
    - (100, "预筛通过"): pass prefilter and enter LLM scoring.

    Product boundary: exclusion keywords intentionally match the job title only,
    not the JD, to avoid rejecting jobs whose JD says things like "非外包".
    """
    profile = config.get("profile", {})
    deal_breakers = profile.get("deal_breakers", [])
    salary_min = profile.get("salary_min", 0)
    allow_internship = profile.get("allow_internship", False)

    title = (job.get("title") or "").lower()
    salary_text = job.get("salary") or ""

    for breaker in deal_breakers:
        if breaker.lower() in title:
            return 0, f"触发排除词: {breaker}"

    if not allow_internship and any(keyword in title for keyword in INTERNSHIP_KEYWORDS):
        return 0, "实习/管培岗位"

    if salary_text and salary_min > 0:
        parsed_min, parsed_max = _parse_salary(salary_text)
        if parsed_max > 0 and parsed_max < salary_min:
            return 0, f"薪资低于硬性要求: {salary_text} < {salary_min}K"

    return 100, "预筛通过"


def _parse_salary(salary_text: str) -> tuple[int, int]:
    """Parse salary text like '15-25K' or '15-25K·14薪' into (min_k, max_k)."""
    match = re.search(r"(\d+)\s*[-~]\s*(\d+)\s*[kK]", salary_text)
    if match:
        return int(match.group(1)), int(match.group(2))
    match = re.search(r"(\d+)\s*[kK]", salary_text)
    if match:
        val = int(match.group(1))
        return val, val
    return 0, 0
```

- [ ] **Step 2: Run prefilter-specific tests and verify GREEN for this task**

Run:

```bash
cd "D:/Ai项目/BossHunter-github" && PYTHONPATH="D:/Ai项目/BossHunter-github/src" python -m unittest \
  "tests.test_regression_small_fixes.PrefilterHardGateTests" -v
```

Expected result: all `PrefilterHardGateTests` pass.

- [ ] **Step 3: Run the full regression file and observe remaining RED items**

Run:

```bash
cd "D:/Ai项目/BossHunter-github" && PYTHONPATH="D:/Ai项目/BossHunter-github/src" python -m unittest "D:/Ai项目/BossHunter-github/tests/test_regression_small_fixes.py" -v
```

Expected result: prefilter tests pass; remaining failures are config/frontend/schema/scorer related.

- [ ] **Step 4: Commit hard prefilter implementation if working with commits enabled**

Run only if the user has asked for commits in this execution session:

```bash
git -C "D:/Ai项目/BossHunter-github" add "src/bosshunter/ai/prefilter.py"
git -C "D:/Ai项目/BossHunter-github" commit -m "feat: hard gate prefilter results"
```

Expected result: commit succeeds. If no commit was requested, skip this step.

---

### Task 3: Remove backend dependency on `prefilter_threshold`

**Files:**
- Modify: `src/bosshunter/ai/scorer.py:89-114`
- Test: `tests/test_regression_small_fixes.py`

- [ ] **Step 1: Remove the threshold variable and change the filter condition**

In `src/bosshunter/ai/scorer.py`, replace:

```python
    threshold = config.get("scoring", {}).get("threshold", 60)
    prefilter_threshold = config.get("scoring", {}).get("prefilter_threshold", 40)
    pending_jobs = get_jobs_by_status(db, "pending")
```

with:

```python
    threshold = config.get("scoring", {}).get("threshold", 60)
    pending_jobs = get_jobs_by_status(db, "pending")
```

Then replace:

```python
            if qs < prefilter_threshold:
                update_job_score(db, job["id"], qs, f"预筛不通过: {qs_reason}")
```

with:

```python
            if qs == 0:
                update_job_score(db, job["id"], qs, f"预筛不通过: {qs_reason}")
```

- [ ] **Step 2: Run scorer source regression test and verify GREEN for this task**

Run:

```bash
cd "D:/Ai项目/BossHunter-github" && PYTHONPATH="D:/Ai项目/BossHunter-github/src" python -m unittest \
  "tests.test_regression_small_fixes.ScorerPrefilterTests" -v
```

Expected result: `test_scorer_no_longer_depends_on_prefilter_threshold` passes.

- [ ] **Step 3: Commit scorer change if working with commits enabled**

Run only if the user has asked for commits in this execution session:

```bash
git -C "D:/Ai项目/BossHunter-github" add "src/bosshunter/ai/scorer.py"
git -C "D:/Ai项目/BossHunter-github" commit -m "fix: filter only hard prefilter failures"
```

Expected result: commit succeeds. If no commit was requested, skip this step.

---

### Task 4: Update backend defaults and example config

**Files:**
- Modify: `src/bosshunter/config.py:37-56`
- Modify: `config.example.yaml:4-28`
- Test: `tests/test_regression_small_fixes.py`

- [ ] **Step 1: Update `src/bosshunter/config.py` defaults**

In `DEFAULTS["profile"]`, replace:

```python
        "deal_breakers": [],
```

with:

```python
        "deal_breakers": [],
        "allow_internship": False,
```

In `DEFAULTS["scoring"]`, replace:

```python
    "scoring": {
        "threshold": 71,
        "prefilter_threshold": 40,
        "max_candidates": 20,
    },
```

with:

```python
    "scoring": {
        "threshold": 71,
        "max_candidates": 20,
    },
```

- [ ] **Step 2: Update `config.example.yaml`**

In `profile`, replace:

```yaml
  deal_breakers: ["外包", "996"]
```

with:

```yaml
  deal_breakers: ["外包", "996"]
  allow_internship: false
```

In `scoring`, replace:

```yaml
scoring:
  threshold: 70
  prefilter_threshold: 40
  max_candidates: 20
```

with:

```yaml
scoring:
  threshold: 70
  max_candidates: 20
```

- [ ] **Step 3: Run config tests and verify GREEN for this task**

Run:

```bash
cd "D:/Ai项目/BossHunter-github" && PYTHONPATH="D:/Ai项目/BossHunter-github/src" python -m unittest \
  "tests.test_regression_small_fixes.ConfigExampleTests" \
  "tests.test_regression_small_fixes.ConfigValidationTests" -v
```

Expected result: all tests in `ConfigExampleTests` and `ConfigValidationTests` pass.

- [ ] **Step 4: Commit config changes if working with commits enabled**

Run only if the user has asked for commits in this execution session:

```bash
git -C "D:/Ai项目/BossHunter-github" add "src/bosshunter/config.py" "config.example.yaml"
git -C "D:/Ai项目/BossHunter-github" commit -m "config: add internship prefilter default"
```

Expected result: commit succeeds. If no commit was requested, skip this step.

---

### Task 5: Update web config schema

**Files:**
- Modify: `src/bosshunter/web/config_schema.json:7-34`
- Test: `tests/test_regression_small_fixes.py`

- [ ] **Step 1: Add `allow_internship` and remove `prefilter_threshold` in schema**

In `src/bosshunter/web/config_schema.json`, replace the `profile.fields` block:

```json
        {"key": "resume_path", "label": "简历文件路径", "type": "file", "description": "上传 .md 格式简历"},
        {"key": "target_cities", "label": "目标城市", "type": "multi-select", "options_from": "cities", "description": "支持多城市"},
        {"key": "salary_min", "label": "最低薪资 (K)", "type": "number", "min": 0, "max": 200, "default": 0},
        {"key": "salary_max", "label": "最高薪资 (K)", "type": "number", "min": 0, "max": 200, "default": 0},
        {"key": "deal_breakers", "label": "排除关键词", "type": "tags", "description": "含这些词的岗位自动跳过"}
```

with:

```json
        {"key": "resume_path", "label": "简历文件路径", "type": "file", "description": "上传 .md 格式简历"},
        {"key": "target_cities", "label": "目标城市", "type": "multi-select", "options_from": "cities", "description": "支持多城市"},
        {"key": "salary_min", "label": "最低薪资 (K)", "type": "number", "min": 0, "max": 200, "default": 0},
        {"key": "salary_max", "label": "最高薪资 (K)", "type": "number", "min": 0, "max": 200, "default": 0},
        {"key": "deal_breakers", "label": "排除关键词", "type": "tags", "description": "含这些词的岗位自动跳过"},
        {"key": "allow_internship", "label": "接受实习/管培岗位", "type": "switch", "default": false}
```

In `scoring.fields`, replace:

```json
        {"key": "threshold", "label": "通过阈值", "type": "slider", "min": 0, "max": 100, "default": 71, "description": "低于此分自动过滤"},
        {"key": "prefilter_threshold", "label": "预筛阈值", "type": "slider", "min": 0, "max": 100, "default": 40},
        {"key": "max_candidates", "label": "每轮最大候选数", "type": "number", "min": 1, "max": 100, "default": 20}
```

with:

```json
        {"key": "threshold", "label": "通过阈值", "type": "slider", "min": 0, "max": 100, "default": 71, "description": "低于此分自动过滤"},
        {"key": "max_candidates", "label": "每轮最大候选数", "type": "number", "min": 1, "max": 100, "default": 20}
```

- [ ] **Step 2: Run schema tests and verify GREEN for this task**

Run:

```bash
cd "D:/Ai项目/BossHunter-github" && PYTHONPATH="D:/Ai项目/BossHunter-github/src" python -m unittest \
  "tests.test_regression_small_fixes.ConfigSchemaTests" -v
```

Expected result: all `ConfigSchemaTests` pass.

- [ ] **Step 3: Commit schema change if working with commits enabled**

Run only if the user has asked for commits in this execution session:

```bash
git -C "D:/Ai项目/BossHunter-github" add "src/bosshunter/web/config_schema.json"
git -C "D:/Ai项目/BossHunter-github" commit -m "config: update web schema for hard prefilter"
```

Expected result: commit succeeds. If no commit was requested, skip this step.

---

### Task 6: Update frontend config page

**Files:**
- Modify: `src/bosshunter/web/frontend/src/pages/ConfigPage.tsx:103-158`
- Test: `tests/test_regression_small_fixes.py`

- [ ] **Step 1: Add the internship switch below exclusion keywords**

In `ConfigPage.tsx`, replace:

```tsx
            <Field label="排除关键词">
              <TagsInput value={config.profile?.deal_breakers || []} onChange={v => updateConfig('profile.deal_breakers', v)} placeholder="如：外包、996" />
            </Field>
```

with:

```tsx
            <Field label="排除关键词">
              <TagsInput value={config.profile?.deal_breakers || []} onChange={v => updateConfig('profile.deal_breakers', v)} placeholder="如：外包、996" />
            </Field>
            <div className="flex items-center justify-between">
              <label className="text-xs text-zinc-400">接受实习/管培岗位</label>
              <Switch checked={config.profile?.allow_internship ?? false} onChange={v => updateConfig('profile.allow_internship', v)} />
            </div>
```

- [ ] **Step 2: Remove the prefilter threshold slider**

In the scoring section of `ConfigPage.tsx`, remove this block completely:

```tsx
            <Field label={`预筛阈值: ${config.scoring?.prefilter_threshold || 40}`}>
              <Slider value={config.scoring?.prefilter_threshold || 40} onChange={v => updateConfig('scoring.prefilter_threshold', v)} min={0} max={100} />
            </Field>
```

The resulting scoring section must keep only:

```tsx
            <Field label={`通过阈值: ${config.scoring?.threshold || 60}`}>
              <Slider value={config.scoring?.threshold || 60} onChange={v => updateConfig('scoring.threshold', v)} min={0} max={100} />
            </Field>
            <Field label="每轮最大候选数">
              <Input type="number" value={config.scoring?.max_candidates || 20} onChange={e => updateConfig('scoring.max_candidates', Number(e.target.value))} min={1} max={100} />
            </Field>
```

- [ ] **Step 3: Run frontend source tests and verify GREEN for this task**

Run:

```bash
cd "D:/Ai项目/BossHunter-github" && PYTHONPATH="D:/Ai项目/BossHunter-github/src" python -m unittest \
  "tests.test_regression_small_fixes.ConfigPageTests" -v
```

Expected result: all `ConfigPageTests` pass.

- [ ] **Step 4: Commit frontend source change if working with commits enabled**

Run only if the user has asked for commits in this execution session:

```bash
git -C "D:/Ai项目/BossHunter-github" add "src/bosshunter/web/frontend/src/pages/ConfigPage.tsx"
git -C "D:/Ai项目/BossHunter-github" commit -m "ui: update prefilter settings"
```

Expected result: commit succeeds. If no commit was requested, skip this step.

---

### Task 7: Run full verification

**Files:**
- Test: `tests/test_regression_small_fixes.py`
- Test: full test suite under `tests/`

- [ ] **Step 1: Run the targeted regression file**

Run:

```bash
cd "D:/Ai项目/BossHunter-github" && PYTHONPATH="D:/Ai项目/BossHunter-github/src" python -m unittest "D:/Ai项目/BossHunter-github/tests/test_regression_small_fixes.py" -v
```

Expected result: all tests in `test_regression_small_fixes.py` pass.

- [ ] **Step 2: Run the full Python test suite**

Run:

```bash
cd "D:/Ai项目/BossHunter-github" && python -m unittest discover -s tests -v
```

Expected result: all tests pass. If failures appear, stop and investigate the first failure before making more changes.

- [ ] **Step 3: Inspect for remaining `prefilter_threshold` references**

Run:

```bash
cd "D:/Ai项目/BossHunter-github" && python - <<'PY'
from pathlib import Path
allowed = {
    Path('tests/test_regression_small_fixes.py'),
    Path('docs/superpowers/plans/2026-06-09-hard-prefilter-gate.md'),
}
for path in Path('.').rglob('*'):
    if path.is_file() and path.suffix in {'.py', '.tsx', '.json', '.yaml', '.yml', '.md'}:
        text = path.read_text(encoding='utf-8', errors='ignore')
        if 'prefilter_threshold' in text and path not in allowed:
            print(path)
PY
```

Expected result: no output. The plan file documents the migration, and `tests/test_regression_small_fixes.py` may contain assertion strings that check the field is absent; source/config files should not retain it.

- [ ] **Step 4: Commit final verified state if working with commits enabled**

Run only if the user has asked for commits in this execution session and previous task commits were skipped:

```bash
git -C "D:/Ai项目/BossHunter-github" add \
  "tests/test_regression_small_fixes.py" \
  "src/bosshunter/ai/prefilter.py" \
  "src/bosshunter/ai/scorer.py" \
  "src/bosshunter/config.py" \
  "config.example.yaml" \
  "src/bosshunter/web/config_schema.json" \
  "src/bosshunter/web/frontend/src/pages/ConfigPage.tsx"
git -C "D:/Ai项目/BossHunter-github" commit -m "Implement hard prefilter gate"
```

Expected result: commit succeeds. If commits were already created task-by-task, skip this step.

---

## Self-Review Notes

- Spec coverage: The plan covers hard prefilter return values, title-only exclusion matching, default internship rejection, internship opt-in, salary-minimum rejection, scorer threshold removal, config defaults, example config, schema update, frontend update, and regression tests.
- Placeholder scan: The plan contains no incomplete markers. Each code-changing step includes exact replacement code.
- Type consistency: Uses `profile.allow_internship` consistently in Python config, schema, frontend source, and tests. Uses `quick_score(job, config) -> tuple[int, str]` consistently.
