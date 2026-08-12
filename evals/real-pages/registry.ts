import type { RealPageRegistryEntry, RetainedRealPageSiteId } from "./contracts";
import registryJson from "./registry.json";

export const RETAINED_REAL_PAGE_REGISTRY = registryJson as readonly RealPageRegistryEntry[];

const SITE_BY_ID = new Map(RETAINED_REAL_PAGE_REGISTRY.map((site) => [site.siteId, site]));

export function retainedSite(siteId: RetainedRealPageSiteId): RealPageRegistryEntry {
  const site = SITE_BY_ID.get(siteId);
  if (!site) throw new Error("Unapproved real-page site.");
  return site;
}

function matchPath(site: RealPageRegistryEntry, url: URL): boolean {
  if (site.siteId === "xiaomi-feishu") return /^\/internship\/resume\/\d+\/apply\/?$/.test(url.pathname) && url.hash === "";
  if (site.siteId === "metaapp-feishu") return /^\/140297\/resume\/\d+\/apply\/?$/.test(url.pathname) && url.hash === "";
  if (["nio-feishu", "anker-feishu", "hesai-feishu"].includes(site.siteId)) {
    return /^\/index\/resume\/\d+\/apply\/?$/.test(url.pathname) && url.hash === "";
  }
  if (site.siteId === "huya-moka") {
    return /^\/campus_apply\/huya\/\d+\/?$/.test(url.pathname) && url.hash === "#/candidateHome/resume";
  }
  if (site.siteId === "lenovo-talent") return url.pathname === "/account/resume" && url.hash === "";
  if (site.siteId === "ctrip-careers") {
    return url.pathname === "/" && /^#\/experienced\/personal-homepage\/editCV\?tabindex=\d+$/.test(url.hash);
  }
  return false;
}

export interface AllowedRealPage {
  siteId: RetainedRealPageSiteId;
  origin: string;
  normalizedPath: string;
}

export function normalizeAllowedRealPage(rawUrl: string): AllowedRealPage {
  let url: URL;
  try {
    url = new URL(rawUrl);
  }
  catch {
    throw new Error("Invalid real-page URL.");
  }
  if (url.protocol !== "https:" || url.username || url.password || url.search) {
    throw new Error("Real-page URL must be credential-free HTTPS without query parameters.");
  }
  const site = RETAINED_REAL_PAGE_REGISTRY.find((candidate) => candidate.origin === url.origin);
  if (!site || !matchPath(site, url)) throw new Error("URL is not one of the eight retained real pages.");
  return { siteId: site.siteId, origin: site.origin, normalizedPath: site.normalizedPath };
}

export function assertNormalizedPageIdentity(
  siteId: RetainedRealPageSiteId,
  page: { origin: string; normalizedPath: string }
): void {
  const site = retainedSite(siteId);
  if (page.origin !== site.origin || page.normalizedPath !== site.normalizedPath) {
    throw new Error("Page identity does not match the retained normalized site entry.");
  }
  if (/[0-9]{6,}/.test(page.normalizedPath.replace("140297", ""))) {
    throw new Error("Normalized path leaks an identifier.");
  }
}
