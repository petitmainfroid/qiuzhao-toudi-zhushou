import { describe, expect, it } from "vitest";
import {
  PROFILE_SCHEMA_VERSION,
  ageFromBirthDate,
  calculateProfileCompletion,
  createEmptyProfile,
  createProjectRecord,
  createWorkExperienceRecord,
  migrateProfile
} from "./profile";

describe("candidate profile", () => {
  it("creates a versioned blank profile without fabricated identity data", () => {
    const profile = createEmptyProfile();
    expect(profile.schemaVersion).toBe(PROFILE_SCHEMA_VERSION);
    expect(profile.basic.fullName).toBe("");
    expect(profile.education).toHaveLength(1);
    expect(profile.workExperiences).toEqual([]);
    expect(profile.projects).toEqual([]);
    expect(profile.workSamples).toEqual([]);
    expect(profile.awards).toEqual([]);
    expect(profile.languages).toEqual([]);
  });

  it("migrates a flat legacy profile into the current structure", () => {
    const migrated = migrateProfile({
      name: "迁移测试",
      phone: "13800000000",
      school: "迁移院校",
      major: "迁移专业",
      degree: "本科"
    });

    expect(migrated.schemaVersion).toBe(PROFILE_SCHEMA_VERSION);
    expect(migrated.basic.fullName).toBe("迁移测试");
    expect(migrated.education[0]).toMatchObject({
      school: "迁移院校",
      major: "迁移专业",
      degree: "本科"
    });
  });

  it("ignores fully blank optional records in completion", () => {
    const profile = createEmptyProfile();
    const baseline = calculateProfileCompletion(profile);
    profile.workExperiences.push(createWorkExperienceRecord());
    profile.projects.push(createProjectRecord());

    expect(calculateProfileCompletion(profile).total).toBe(baseline.total);
  });

  it("adds required checks after an optional record is started", () => {
    const profile = createEmptyProfile();
    const work = createWorkExperienceRecord();
    work.company = "已填写公司";
    profile.workExperiences.push(work);

    const completion = calculateProfileCompletion(profile);
    expect(completion.total).toBe(16);
    expect(completion.missing.map((item) => item.path)).toContain(
      "workExperiences.0.role"
    );
  });

  it("calculates 100 percent for the required baseline", () => {
    const profile = createEmptyProfile();
    profile.basic = {
      ...profile.basic,
      fullName: "验证姓名",
      phone: "13800000000",
      email: "test@example.test",
      nationality: "中国",
      currentCity: "上海"
    };
    profile.education[0] = {
      ...profile.education[0],
      school: "验证院校",
      degree: "本科",
      educationType: "全日制",
      major: "计算机科学",
      startDate: "2022-09",
      endDate: "2026-06"
    };
    profile.jobPreference.targetRoles = "产品经理";
    profile.jobPreference.preferredCities = "上海";

    expect(calculateProfileCompletion(profile)).toMatchObject({
      filled: 13,
      total: 13,
      percentage: 100,
      missing: []
    });
  });

  it("migrates version 1 profiles without losing existing structured data", () => {
    const previous = createEmptyProfile() as unknown as Record<string, unknown>;
    previous.schemaVersion = 1;
    delete previous.workSamples;
    delete previous.awards;
    delete previous.languages;
    const basic = previous.basic as Record<string, unknown>;
    basic.fullName = "旧版档案";
    delete basic.nationality;

    const migrated = migrateProfile(previous);
    expect(migrated.basic.fullName).toBe("旧版档案");
    expect(migrated.workSamples).toEqual([]);
    expect(migrated.schemaVersion).toBe(PROFILE_SCHEMA_VERSION);
  });

  it("derives age from the saved birth date", () => {
    expect(ageFromBirthDate("2003-08-04", new Date(2026, 7, 3))).toBe("22");
    expect(ageFromBirthDate("2003-08-03", new Date(2026, 7, 3))).toBe("23");
    expect(ageFromBirthDate("not-a-date", new Date(2026, 7, 3))).toBe("");
  });
});
