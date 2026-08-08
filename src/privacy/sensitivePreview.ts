const IDENTITY_NUMBER_PATH = "basic.identityDocumentNumber";

export function profileValuePreview(path: string, value: string): string {
  const collapsed = value.replace(/\s+/g, " ").trim();
  if (path !== IDENTITY_NUMBER_PATH || !collapsed) return collapsed;
  const suffix = collapsed.slice(-4);
  return `••••••${suffix}`;
}
