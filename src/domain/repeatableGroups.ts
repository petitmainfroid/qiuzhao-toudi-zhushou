export const repeatableGroupKeys = [
  "education",
  "workExperiences",
  "workSamples",
  "projects",
  "awards",
  "languages"
] as const;

export type RepeatableGroupKey = typeof repeatableGroupKeys[number];
