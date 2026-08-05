export function normalizeFieldText(value: string): string {
  return value
    .normalize("NFKC")
    .toLocaleLowerCase("en-US")
    .replace(/[\s\p{P}\p{S}_]+/gu, "")
    .trim();
}

export function tokenizeFieldText(value: string): string[] {
  return value
    .normalize("NFKC")
    .toLocaleLowerCase("en-US")
    .replace(/([\p{Script=Han}])/gu, " $1 ")
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean);
}

export function jaccardSimilarity(left: string[], right: string[]): number {
  const leftSet = new Set(left);
  const rightSet = new Set(right);
  const union = new Set([...leftSet, ...rightSet]);
  if (union.size === 0) return 0;
  let intersection = 0;
  leftSet.forEach((token) => {
    if (rightSet.has(token)) intersection += 1;
  });
  return intersection / union.size;
}
