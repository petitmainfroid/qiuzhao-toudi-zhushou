import { feishuRecruitingManifest, isFeishuRecruitingApplicationUrl } from "./feishu";
import { isLenovoTalentResumeUrl, lenovoTalentManifest } from "./lenovo";
import { isMokaCandidateResumeUrl, mokaManifest } from "./moka";

export { feishuRecruitingManifest, isFeishuRecruitingApplicationUrl } from "./feishu";
export { isLenovoTalentResumeUrl, lenovoTalentManifest } from "./lenovo";
export { isMokaCandidateResumeUrl, mokaManifest } from "./moka";

export const productionRecruitmentAdapterManifests = [
  feishuRecruitingManifest,
  mokaManifest,
  lenovoTalentManifest
] as const;

export function isProductionRecruitmentAdapterUrl(url: string): boolean {
  return isFeishuRecruitingApplicationUrl(url)
    || isMokaCandidateResumeUrl(url)
    || isLenovoTalentResumeUrl(url);
}
