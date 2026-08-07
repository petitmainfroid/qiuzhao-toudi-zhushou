import { normalizeFieldText } from "../matching/normalize";

export function normalizeComparableValue(profilePath: string, value: string): string {
  const trimmed = value.normalize("NFKC").trim();
  if (/email/i.test(profilePath)) return trimmed.toLowerCase();
  if (/phone|mobile|tel/i.test(profilePath)) return trimmed.replace(/\D/g, "");
  if (/(?:^|\.)(?:date|birthDate|startDate|endDate|availableDate|age)(?:\.|$)/i.test(profilePath)) {
    return trimmed.replace(/\D/g, "");
  }
  return normalizeFieldText(trimmed);
}
