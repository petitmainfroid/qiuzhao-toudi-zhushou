# Resumable job workflow

`JobWorkflowService` is the single business-state boundary for the job-hunting
Agent and a future workbench. The Agent adapter is intentionally thin; a future
UI must call this service rather than copy its state machine.

The workflow is split at durable gates. Zhilian discovery is read-only and is
deduplicated through `LocalJobRepository`. Ranking accepts only closed job facts,
capability-presence booleans and consistent semantic decisions; deterministic
hard rejects still run locally first. Review is explicit. Preparing an approved
job stops at `authorization_required`: the Agent cannot create a lease, call the
application writer, upload a file, send a message, or reach final submission.

`LocalJobWorkflowStore` persists only identifiers, hashes, reason codes, counts
and terminal summaries. It uses bounded compare-before-delete locks for both
the store and workflow/job ownership. If a process dies after repository writes
but before a workflow checkpoint, replay reuses repository terminals and makes
no duplicate record or ranking event.

The current Codex/Claude interface lives in `skills/job-hunting/`. It is a
separate MCP namespace and does not change the six existing campus-application
tools. The production factory reuses the fixed, isolated Zhilian browser session
when it exists and otherwise falls back to the normal product session; no
session/profile path is accepted through MCP. No workbench UI is implemented by
Z005.
