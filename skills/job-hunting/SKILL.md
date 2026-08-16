---
name: qiuzhao-job-hunting
description: Run the local resumable Zhilian job discovery, ranking, review, and pre-authorization workflow through the separate intent-level Job Agent MCP server.
---

# 秋招求职 Agent

Use only the `job_*` tools from the separate job-hunting MCP server. They call
the shared `JobWorkflowService`; do not reconstruct workflow state in chat.

1. Call `job_workspace_status` and reuse an existing workflow request ID when
   resuming.
2. Call `job_search_start` with one bounded Zhilian search. The user must have
   selected a logged-in Zhilian `/sou/` tab in the dedicated browser. Treat a
   blocker as a stop condition; never ask for a password, Cookie or CAPTCHA.
3. For every frozen returned job, derive only `city`, `jobType` and minimum
   monthly salary facts. Submit exactly one consistent semantic decision per
   job with `job_ranking_submit`. Missing facts stay `null`/`unknown`; never
   invent them. Local deterministic exclusions cannot be overridden.
4. Show `job_review_queue` to the user. Call `job_review_decide` only for the
   exact decision the user made. An approval is not an authorization lease.
5. `job_application_prepare` may be called for an approved job. It must stop at
   `authorization_required`. The user grants any ordinary-field lease through
   the existing local application CLI; the Job Agent cannot grant or expand it.
6. Use `job_workflow_status` to resume and `job_workflow_cancel` when requested.

Never submit an application, send an arbitrary message, click save/consent,
handle verification or identity, expose selectors/scripts/raw CDP, accept a
local path or arbitrary upload, or reveal profile/page scalar values. A future
workbench will call the same workflow service and must not duplicate this logic.
