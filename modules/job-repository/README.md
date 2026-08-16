# Local job repository

`LocalJobRepository` is the local source of truth for enterprise/campus, BOSS
and Zhilian job records. Its JSON store is atomically replaced inside the existing
application-data root and is protected by a bounded cross-instance lock.

It stores only job identity, normalized public job URL, title, company, JD,
source, status, scoring summary, record version and reason-code-only events.
It does **not** store browser cookies, recruitment credentials, verification
codes, candidate profile values, raw DOM/HTML, or complete conversation text.

`ingestZhilianDiscovery()` is the closed Z003 handoff from the Z002 read-only
adapter. It accepts only the fixed normalized discovery result, validates the
whole batch before the first repository write, and rejects blockers or any
non-zero page-write, submission or credential-read counter. Identical replay is
a true repository no-op: no new record, version, event or repository revision.
If a process is interrupted mid-batch, replay writes only the not-yet-stored
jobs. A private repository safety audit reports aggregate category counts only;
it never returns stored values.

For an Agent-assisted reply, a JD and the currently open conversation may be
used as private, transient inputs to produce a draft. Durable repository events
contain no chat body or candidate scalar values. Sending any external message
remains a job-scoped, time-bounded, user-authorized workflow action.

## CLI

```powershell
npm run qiuzhao -- jobs help
```

The CLI accepts only closed commands and known options. It is not a browser
control surface and rejects selectors, scripts, arbitrary files and unknown
parameters.
