import { describe, expect, it } from "vitest";
import type { AtsFamilyDetectionContext } from "./contracts";
import { AtsFamilyRegistry } from "./familyRegistry";

const context: AtsFamilyDetectionContext = {
  source: {
    origin: "https://careers.example.test",
    pathTemplate: "/campus/apply/:id",
    language: "zh-CN",
    pageType: "application",
    captureToolVersion: "0.2.0"
  },
  controls: [],
  markers: ["anonymous-form"]
};

describe("AtsFamilyRegistry", () => {
  it("chooses the highest valid detector and resolves ties deterministically", () => {
    const registry = new AtsFamilyRegistry([
      {
        id: "zeta-family",
        version: "2.1",
        detect: () => ({ confidence: 0.91, evidence: [{ kind: "path", detail: "campus apply path" }] })
      },
      {
        id: "alpha-family",
        version: "1",
        detect: () => ({ confidence: 0.91, evidence: [{ kind: "control-structure", detail: "anonymous structure" }] })
      },
      {
        id: "lower-family",
        version: "1",
        detect: () => ({ confidence: 0.72, evidence: [{ kind: "origin", detail: "example host" }] })
      }
    ]);

    expect(registry.detect(context)).toEqual({
      id: "alpha-family",
      version: "1",
      confidence: 0.91,
      evidence: [{ kind: "control-structure", detail: "anonymous structure" }]
    });
  });

  it("redacts detector evidence and falls back when candidates fail closed", () => {
    const redactingRegistry = new AtsFamilyRegistry([{
      id: "safe-family",
      version: "1",
      detect: () => ({
        confidence: 0.8,
        evidence: [{ kind: "semantic-marker", detail: "owner candidate@example.com phone 13800138000" }]
      })
    }]);
    expect(redactingRegistry.detect(context).evidence[0]?.detail).toBe("owner [邮箱] phone [电话]");

    const fallbackRegistry = new AtsFamilyRegistry([
      {
        id: "broken-family",
        version: "1",
        detect: () => { throw new Error("detector failure"); }
      },
      {
        id: "weak-family",
        version: "1",
        detect: () => ({ confidence: 0.3, evidence: [{ kind: "path", detail: "weak" }] })
      }
    ]);
    expect(fallbackRegistry.detect(context)).toEqual({
      id: "generic-html",
      version: "1",
      confidence: 0,
      evidence: []
    });
  });

  it("rejects unsafe registrations and duplicate family ids", () => {
    expect(() => new AtsFamilyRegistry([{ id: "Bad Family", version: "1", detect: () => null }])).toThrow();
    expect(() => new AtsFamilyRegistry([
      { id: "same-family", version: "1", detect: () => null },
      { id: "same-family", version: "2", detect: () => null }
    ])).toThrow(/Duplicate/);
  });
});
