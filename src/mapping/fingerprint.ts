import type { FieldDescriptor } from "../matching/types";
import { normalizeFieldText } from "../matching/normalize";

export function createFieldFingerprint(descriptor: FieldDescriptor): string {
  return [
    descriptor.kind,
    descriptor.label,
    descriptor.ariaLabel,
    descriptor.placeholder,
    descriptor.name,
    descriptor.domId
  ].map(normalizeFieldText).join("|");
}
