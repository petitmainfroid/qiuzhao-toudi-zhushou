import { feishuRecruitingManifest, isFeishuRecruitingApplicationUrl } from "./feishu";
import { isMokaCandidateResumeUrl, mokaManifest } from "./moka";

export { feishuRecruitingManifest, isFeishuRecruitingApplicationUrl } from "./feishu";
export { isMokaCandidateResumeUrl, mokaManifest } from "./moka";

export const productionRecruitmentAdapterManifests = [
  feishuRecruitingManifest,
  mokaManifest
] as const;

export function isProductionRecruitmentAdapterUrl(url: string): boolean {
  return isFeishuRecruitingApplicationUrl(url) || isMokaCandidateResumeUrl(url);
}
