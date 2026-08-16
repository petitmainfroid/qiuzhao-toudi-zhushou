# Job-domain contracts

This package is the closed public boundary for the job-hunting domain. It is
intentionally independent from the campus-application MCP tools.

All commands are plain objects with exact keys. The contracts reject browser
selectors, scripts, coordinates, file paths, cookies, credentials, profile
scalar values and arbitrary external-message text. Job URLs are HTTPS-only,
strip query/hash material, and reject embedded credentials.

| Consumer | Command boundary | Terminal/result states |
| --- | --- | --- |
| repository | job candidate, versioned status transition | `JOB_STATUSES` |
| discovery | source, keywords, city, bounded limit | `DISCOVERY_BLOCKERS` |
| ranking | job ID, capability summary | `RANKING_OUTCOMES` |
| conversation | job ID, compiled plan ID, request ID | `CONVERSATION_OUTCOMES` |
| workflow | job ID, request ID, stage | `WORKFLOW_OUTCOMES` |
| workbench | job ID, request ID, closed UI intent | a workflow result |
| Agent skill | closed job-domain intent and request ID | a workflow result |

These contracts are E1 primitives only. They do not establish real-site
compatibility; that requires the retained real page and the denominators in
`boss/REAL_OPERATION_ACCEPTANCE.md`.
