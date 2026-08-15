import { describe, expect, it, vi } from "vitest";
import {
  PersistentRequestLedger,
  type RequestLedgerStore,
  type StoredRequestLedger
} from "./requestLedger";

function harness(shared?: { ledger: StoredRequestLedger }) {
  const state = shared ?? { ledger: { entries: [] } };
  let now = 1_000;
  const store: RequestLedgerStore = {
    load: vi.fn(async () => structuredClone(state.ledger)),
    save: vi.fn(async (ledger) => { state.ledger = structuredClone(ledger); })
  };
  return {
    shared: state,
    store,
    ledger: new PersistentRequestLedger({
      store,
      now: () => now,
      digest: async (value) => `digest:${value}`
    }),
    advance(milliseconds: number) { now += milliseconds; }
  };
}

const operation = {
  requestId: "action_request_1234",
  sessionId: "power_session_1234",
  fingerprint: "fixed-action-fingerprint"
};

describe("PersistentRequestLedger", () => {
  it("persists completion before replaying an identical request", async () => {
    const test = harness();
    const execute = vi.fn(async () => ({ status: "verified" }));
    expect(await test.ledger.run(operation, execute)).toEqual({
      kind: "executed",
      value: { status: "verified" }
    });
    expect(await test.ledger.run(operation, execute)).toEqual({
      kind: "replayed",
      value: { status: "verified" }
    });
    expect(execute).toHaveBeenCalledTimes(1);
  });

  it("blocks a concurrent duplicate while the first side effect is in flight", async () => {
    const test = harness();
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    let started!: () => void;
    const began = new Promise<void>((resolve) => { started = resolve; });
    const execute = vi.fn(async () => {
      started();
      await gate;
      return { status: "verified" };
    });
    const first = test.ledger.run(operation, execute);
    await began;
    expect(await test.ledger.run(operation, execute)).toEqual({ kind: "uncertain" });
    release();
    expect(await first).toEqual({ kind: "executed", value: { status: "verified" } });
    expect(execute).toHaveBeenCalledTimes(1);
  });

  it("rejects reuse of a request ID with another session or payload digest", async () => {
    const test = harness();
    await test.ledger.run(operation, async () => ({ status: "verified" }));
    expect(await test.ledger.run({ ...operation, fingerprint: "different" }, async () => null))
      .toEqual({ kind: "conflict" });
    expect(await test.ledger.run({ ...operation, sessionId: "power_session_other" }, async () => null))
      .toEqual({ kind: "conflict" });
  });

  it("survives worker restart for both completed and uncertain in-flight requests", async () => {
    const completed = harness();
    await completed.ledger.run(operation, async () => ({ status: "verified" }));
    const restarted = harness(completed.shared);
    const repeated = vi.fn(async () => ({ status: "should-not-run" }));
    expect(await restarted.ledger.run(operation, repeated)).toEqual({
      kind: "replayed",
      value: { status: "verified" }
    });
    expect(repeated).not.toHaveBeenCalled();

    const inFlight = harness();
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    let started!: () => void;
    const began = new Promise<void>((resolve) => { started = resolve; });
    const first = inFlight.ledger.run(operation, async () => {
      started();
      await gate;
      return { status: "verified" };
    });
    await began;
    const recovered = harness(inFlight.shared);
    const unsafeRetry = vi.fn(async () => ({ status: "duplicated" }));
    expect(await recovered.ledger.run(operation, unsafeRetry)).toEqual({ kind: "uncertain" });
    expect(unsafeRetry).not.toHaveBeenCalled();
    release();
    await first;
  });
});
