import { describe, expect, it } from "vitest";
import { JobContractValidationError, parseConversationExecutionRequest, parseConversationIntent, parseJobActionLease, parseJobEvent, parseJobRankingDecision, parseJobRankingRequest, parseJobRecord } from "../src/index";

const now = "2026-08-14T08:00:00.000Z";
const record = () => ({ schemaVersion: 1, jobId: "job:001", identity: { source: "boss", origin: "https://www.zhipin.com", path: "/web/geek/job", sourceJobRef: "source:001" }, title: "Software Engineer", company: "Example", location: "Shanghai", description: "Build local-first tools.", state: "discovered", version: 0, createdAt: now, updatedAt: now });

describe("job workstream closed contracts", () => {
  it("accepts a public job record without browser or profile scalars", () => {
    const parsed = parseJobRecord(record());
    expect(parsed.identity.path).toBe("/web/geek/job");
    expect(Object.isFrozen(parsed)).toBe(true);
  });

  it.each([{ selector: "#message" }, { rawHtml: "<input>" }, { cookie: "secret" }, { password: "secret" }, { profileValue: "Alice" }, { script: "document.forms[0].submit()" }, { upload: "resume.pdf" }, { apiKey: "secret" }])("rejects unsafe job-record surface %#", (extra) => {
    expect(() => parseJobRecord({ ...record(), ...extra })).toThrow(JobContractValidationError);
  });

  it.each([
    { ...record(), identity: { ...record().identity, origin: "http://www.zhipin.com" } },
    { ...record(), identity: { ...record().identity, path: "/web/geek/job?token=secret" } },
    { ...record(), identity: { ...record().identity, path: "/web/geek/job#fragment" } },
    { ...record(), identity: { ...record().identity, source: "linkedin" } }
  ])("rejects non-normalized or unsupported identity %#", (invalid) => expect(() => parseJobRecord(invalid)).toThrow(JobContractValidationError));

  it("accepts ranking data with availability-only profile metadata", () => {
    expect(parseJobRankingRequest({ schemaVersion: 1, job: { jobId: "job:001", title: "Engineer", company: "Example", location: "Shanghai", description: "JD" }, profileCatalog: [{ path: "basics.fullName", hasValue: true, safetyClass: "ordinary" }] })).toMatchObject({ schemaVersion: 1 });
    expect(parseJobRankingDecision({ schemaVersion: 1, jobId: "job:001", outcome: "review", reason: "ambiguous" }).outcome).toBe("review");
  });

  it("rejects ranking values and arbitrary AI output", () => {
    expect(() => parseJobRankingRequest({ schemaVersion: 1, job: { jobId: "job:001", title: "Engineer", company: "Example", location: "Shanghai", description: "JD" }, profileCatalog: [{ path: "basics.fullName", hasValue: true, safetyClass: "ordinary", value: "Alice" }] })).toThrow(JobContractValidationError);
    expect(() => parseJobRankingDecision({ schemaVersion: 1, jobId: "job:001", outcome: "pass", reason: "relevant", score: 100 })).toThrow(JobContractValidationError);
  });

  it("binds conversation to local intent and an opaque execution plan", () => {
    expect(parseConversationIntent({ schemaVersion: 1, jobId: "job:001", kind: "generate_greeting" })).toMatchObject({ kind: "generate_greeting" });
    expect(parseConversationExecutionRequest({ schemaVersion: 1, planId: "plan:001", requestId: "request:001" })).toMatchObject({ planId: "plan:001" });
    expect(() => parseConversationIntent({ schemaVersion: 1, jobId: "job:001", kind: "generate_greeting", message: "hello" })).toThrow(JobContractValidationError);
    expect(() => parseConversationExecutionRequest({ schemaVersion: 1, planId: "plan:001", requestId: "request:001", selector: "#send" })).toThrow(JobContractValidationError);
  });

  it("accepts only exact job-scoped, time-bounded action leases", () => {
    expect(parseJobActionLease({ schemaVersion: 1, leaseId: "lease:001", jobIds: ["job:001"], origins: ["https://www.zhipin.com"], actions: ["send_message"], expiresAt: "2026-08-14T08:10:00.000Z" }).actions).toEqual(["send_message"]);
    expect(() => parseJobActionLease({ schemaVersion: 1, leaseId: "lease:001", jobIds: ["job:001"], origins: ["https://www.zhipin.com"], actions: ["submit"], expiresAt: now })).toThrow(JobContractValidationError);
    expect(() => parseJobActionLease({ schemaVersion: 1, leaseId: "lease:001", jobIds: ["job:001"], origins: ["https://www.zhipin.com"], actions: ["send_message"], expiresAt: now, createByAgent: true })).toThrow(JobContractValidationError);
  });

  it("keeps event evidence typed and scalar-free", () => {
    expect(parseJobEvent({ schemaVersion: 1, eventId: "event:001", jobId: "job:001", kind: "blocked", at: now, requestId: "request:001", terminalReason: "login_required" }).kind).toBe("blocked");
    expect(() => parseJobEvent({ schemaVersion: 1, eventId: "event:001", jobId: "job:001", kind: "message_sent", at: now, requestId: "request:001", content: "hello" })).toThrow(JobContractValidationError);
  });
});
