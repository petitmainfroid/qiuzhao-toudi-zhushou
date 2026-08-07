import {
  defaultAtsFamilyRegistry,
  defaultAtsTemplateRegistry
} from "./defaultTemplates";
import { AtsMatchingRuntime } from "./matchingRuntime";

export const defaultAtsMatchingRuntime = new AtsMatchingRuntime(
  defaultAtsFamilyRegistry,
  defaultAtsTemplateRegistry
);
