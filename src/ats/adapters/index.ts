import { ctripCareersManifest, isCtripExperiencedEditCvUrl } from "./ctrip";
import { feishuRecruitingManifest, isFeishuRecruitingApplicationUrl } from "./feishu";
import { isLenovoTalentResumeUrl, lenovoTalentManifest } from "./lenovo";
import { isMokaCandidateResumeUrl, mokaManifest } from "./moka";

export { ctripCareersManifest, isCtripExperiencedEditCvUrl } from "./ctrip";
export { feishuRecruitingManifest, isFeishuRecruitingApplicationUrl } from "./feishu";
export { isLenovoTalentResumeUrl, lenovoTalentManifest } from "./lenovo";
export { isMokaCandidateResumeUrl, mokaManifest } from "./moka";

export const productionRecruitmentAdapterManifests = [
  feishuRecruitingManifest,
  mokaManifest,
  lenovoTalentManifest,
  ctripCareersManifest
] as const;

export function isProductionRecruitmentAdapterUrl(url: string): boolean {
  return isFeishuRecruitingApplicationUrl(url)
    || isMokaCandidateResumeUrl(url)
    || isLenovoTalentResumeUrl(url)
    || isCtripExperiencedEditCvUrl(url);
}
