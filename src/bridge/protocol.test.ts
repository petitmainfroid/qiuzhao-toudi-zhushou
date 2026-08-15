import { describe, expect, it } from "vitest";
import { isEmbeddedBridgeRequest } from "./protocol";

describe("embedded bridge protocol validation", () => {
  it("accepts bounded semantic find requests", () => {
    expect(isEmbeddedBridgeRequest({
      type: "POWER_PAGE_FIND",
      requestId: "request_12345678",
      query: { text: "毕业院校", roles: ["textbox"], limit: 5 }
    })).toBe(true);
  });

  it("rejects empty, oversized, invalid-role, and unbounded find requests", () => {
    for (const query of [
      { text: "" },
      { text: "x".repeat(121) },
      { text: "姓名", roles: ["selector"] },
      { text: "姓名", limit: 200 }
    ]) {
      expect(isEmbeddedBridgeRequest({
        type: "POWER_PAGE_FIND",
        requestId: "request_12345678",
        query
      })).toBe(false);
    }
  });
});
