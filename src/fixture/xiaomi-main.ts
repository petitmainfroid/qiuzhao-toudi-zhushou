import type { CandidateProfile } from "../domain/profile";
import { fillPage, scanPage, type FillResult, type FillSelection, type ScanResult } from "../content/engine";

declare global {
  interface Window {
    __xiaomiFixture: {
      scan(profile: CandidateProfile): ScanResult;
      fill(profile: CandidateProfile, selections: FillSelection[]): Promise<FillResult>;
      submitCount: number;
    };
  }
}

window.__xiaomiFixture = {
  scan: scanPage,
  fill: fillPage,
  submitCount: 0
};

const degreeTrigger = document.querySelector<HTMLElement>(
  "#education\\[0\\]\\.degree [role='combobox']"
);
const degreeOptions = document.getElementById("education-degree-options");
degreeTrigger?.addEventListener("click", () => {
  degreeOptions?.removeAttribute("hidden");
  degreeTrigger.setAttribute("aria-expanded", "true");
});
degreeOptions?.querySelectorAll<HTMLElement>("[role='option']").forEach((option) => {
  option.addEventListener("click", () => {
    const selected = degreeTrigger?.querySelector<HTMLElement>(
      ".atsx-select-selection-selected-value"
    );
    if (selected) selected.textContent = option.textContent;
    degreeOptions.setAttribute("hidden", "");
    degreeTrigger?.setAttribute("aria-expanded", "false");
  });
});

document.getElementById("xiaomi-application-form")?.addEventListener("submit", (event) => {
  event.preventDefault();
  window.__xiaomiFixture.submitCount += 1;
});
