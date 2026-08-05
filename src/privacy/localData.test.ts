import { describe, expect, it } from "vitest";
import { createEmptyProfile } from "../domain/profile";
import { parseLocalData, serializeLocalData } from "./localData";

describe("local data portability", () => {
  it("round-trips a versioned profile and mapping bundle", () => {
    const profile = createEmptyProfile();
    profile.basic.fullName = "导入导出验证";
    const serialized = serializeLocalData(profile, [{
      site: "https://jobs.example",
      fingerprint: "text|name",
      profilePath: "basic.fullName",
      canonicalLabel: "姓名",
      updatedAt: "2026-08-03T10:00:00.000Z"
    }]);
    const parsed = parseLocalData(serialized);
    expect(parsed.profile.basic.fullName).toBe("导入导出验证");
    expect(parsed.mappings).toHaveLength(1);
  });

  it("rejects unsupported files", () => {
    expect(() => parseLocalData('{"format":"unknown","version":9}')).toThrow(/不受支持/);
  });
});
