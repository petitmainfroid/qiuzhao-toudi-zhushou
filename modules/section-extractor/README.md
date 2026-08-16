# Section Extractor

This module discovers semantic form sections before child controls are
classified. It is now production context for the existing control-first page
reader: `shared/bridge/pageState.ts` attaches the resulting privacy-safe
`sectionKind` and `recordIndex` to structurally owned controls. The planner may
use that context to disambiguate repeated labels, while all writes still go
through the existing compiler, browser kernel, Boolean readback, and audit.

Output:

```ts
type PageSection = {
  ref: string;
  kind: "basic" | "education" | "work" | "internship" | "project" | "language" | "award" | "unknown";
  heading: string;
  recordIndex?: number;
  controlRefs: string[];
};
```

The module does not read field values, credentials, cookies, or browser
selectors, and it performs no page actions. Child-control recognition, opaque
references, MCP exposure, and execution remain owned by the existing
privacy-safe bridge and controlled application workflow.
