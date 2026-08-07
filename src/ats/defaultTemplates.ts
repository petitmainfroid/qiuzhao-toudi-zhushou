import { genericHtmlTemplate } from "./adapters/generic";
import {
  feishuRecruitingDetector,
  feishuRecruitingTemplate
} from "./adapters/feishu";
import { AtsFamilyRegistry } from "./familyRegistry";
import { AtsTemplateRegistry } from "./templateRegistry";

export { genericHtmlTemplate } from "./adapters/generic";
export {
  FEISHU_RECRUITING_FAMILY_ID,
  feishuRecruitingDetector,
  feishuRecruitingTemplate
} from "./adapters/feishu";

export const defaultAtsFamilyRegistry = new AtsFamilyRegistry([feishuRecruitingDetector]);
export const defaultAtsTemplateRegistry = new AtsTemplateRegistry([
  genericHtmlTemplate,
  feishuRecruitingTemplate
]);
