import type { CandidateProfile } from "../domain/profile";
import { fillPage, scanPage, type FillSelection, type FillResult, type ScanResult } from "../content/engine";

declare global {
  interface Window {
    __qiuzhaoFixture: {
      scan(profile: CandidateProfile): ScanResult;
      fill(profile: CandidateProfile, selections: FillSelection[]): Promise<FillResult>;
      eventCount: number;
      submitCount: number;
    };
  }
}

window.__qiuzhaoFixture = {
  scan: scanPage,
  fill: fillPage,
  eventCount: 0,
  submitCount: 0
};

document.getElementById("application-form")?.addEventListener("input", () => {
  window.__qiuzhaoFixture.eventCount += 1;
});
document.getElementById("application-form")?.addEventListener("submit", (event) => {
  event.preventDefault();
  window.__qiuzhaoFixture.submitCount += 1;
});

document.getElementById("add-dynamic")?.addEventListener("click", () => {
  document.getElementById("dynamic-fields")?.removeAttribute("hidden");
});
