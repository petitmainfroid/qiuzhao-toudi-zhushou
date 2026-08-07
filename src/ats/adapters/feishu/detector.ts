import type { AtsFamilyDetector, AtsFamilyEvidence } from "../../contracts";

export const FEISHU_RECRUITING_FAMILY_ID = "feishu-recruiting";

const semanticMarkers = [
  "basic_info.name",
  "basic_info.mobile",
  "basic_info.email",
  "education_list[].school",
  "self_evaluation.self_evaluation"
];

function tenantKind(origin: string): "feishu" | "mioffice" | null {
  try {
    const url = new URL(origin);
    if (url.protocol !== "https:" || url.pathname !== "/") return null;
    const hostname = url.hostname.toLowerCase();
    if (hostname === "jobs.feishu.cn" || hostname.endsWith(".jobs.feishu.cn")) return "feishu";
    if (hostname === "jobs.f.mioffice.cn" || hostname.endsWith(".jobs.f.mioffice.cn")) return "mioffice";
    return null;
  }
  catch {
    return null;
  }
}

function isApplicationPath(pathTemplate: string): boolean {
  return /^\/(?:index|internship|:id)\/resume\/:id\/apply\/?$/.test(pathTemplate);
}

export const feishuRecruitingDetector: AtsFamilyDetector = {
  id: FEISHU_RECRUITING_FAMILY_ID,
  version: "1",
  detect(context) {
    const tenant = tenantKind(context.source.origin);
    if (!tenant) return null;

    const applicationPath = isApplicationPath(context.source.pathTemplate);
    const markerSet = new Set(context.markers);
    const markerCount = semanticMarkers.filter((marker) => markerSet.has(marker)).length;
    const evidence: AtsFamilyEvidence[] = [{
      kind: "origin",
      detail: tenant === "feishu"
        ? "Feishu Recruiting tenant host suffix"
        : "Feishu Recruiting mioffice tenant host suffix"
    }];
    if (applicationPath) {
      evidence.push({ kind: "path", detail: "reviewed Feishu resume application path" });
    }
    if (markerCount > 0) {
      evidence.push({
        kind: "semantic-marker",
        detail: `${markerCount} Feishu resume schema markers`
      });
    }

    return {
      confidence: Math.min(0.98, 0.76 + (applicationPath ? 0.14 : 0) + markerCount * 0.016),
      evidence
    };
  }
};
