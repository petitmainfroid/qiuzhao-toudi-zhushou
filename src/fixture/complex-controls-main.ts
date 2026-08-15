import type { CandidateProfile } from "../domain/profile";
import { fillPage, scanPage, type FillResult, type FillSelection, type ScanResult } from "../content/engine";

declare global {
  interface Window {
    __complexControlsFixture: {
      scan(profile: CandidateProfile): ScanResult;
      fill(profile: CandidateProfile, selections: FillSelection[]): Promise<FillResult>;
      inputEvents: number;
      submitCount: number;
    };
  }
}

function wireSelect(rootId: string, popupId: string, onSelected?: (value: string) => void): void {
  const root = document.getElementById(rootId)!;
  const trigger = root.querySelector<HTMLElement>("[role='combobox']")!;
  const popup = document.getElementById(popupId)!;
  const selected = root.querySelector<HTMLElement>(".atsx-select-selection-selected-value")!;
  trigger.addEventListener("click", () => popup.removeAttribute("hidden"));
  popup.addEventListener("click", (event) => {
    const option = (event.target as Element | null)?.closest<HTMLElement>("[role='option']");
    if (!option) return;
    selected.textContent = option.textContent;
    popup.setAttribute("hidden", "");
    onSelected?.(option.textContent?.trim() ?? "");
  });
}

wireSelect("school-select", "school-options", (value) => {
  if (value !== "第一测试大学") return;
  const option = document.createElement("li");
  option.role = "option";
  option.textContent = "软件工程";
  document.getElementById("major-options")!.replaceChildren(option);
});
wireSelect("degree-select", "degree-options");
wireSelect("major-select", "major-options");

const rangeInput = document.querySelector<HTMLInputElement>(".atsx-date-picker-period-hidden-input")!;
rangeInput.addEventListener("input", () => {
  const range = JSON.parse(rangeInput.value) as { start: string; end: string };
  document.querySelector<HTMLElement>('[data-date-display="start"]')!.textContent = range.start;
  document.querySelector<HTMLElement>('[data-date-display="end"]')!.textContent = range.end;
});

document.getElementById("career-plan")?.addEventListener("input", (event) => {
  (event.currentTarget as HTMLElement).textContent = "网页保留的匿名测试内容";
});

const fixture = {
  scan: scanPage,
  async fill(profile: CandidateProfile, selections: FillSelection[]): Promise<FillResult> {
    const result = await fillPage(profile, selections);
    const status = document.getElementById("driver-status");
    if (status) status.textContent = `已验证写入 ${result.filledCount} 项，安全跳过 ${result.skippedCount} 项，最终提交 0 次。`;
    return result;
  },
  inputEvents: 0,
  submitCount: 0
};

window.__complexControlsFixture = fixture;

document.getElementById("complex-application-form")?.addEventListener("input", () => {
  fixture.inputEvents += 1;
});
document.getElementById("complex-application-form")?.addEventListener("submit", (event) => {
  event.preventDefault();
  fixture.submitCount += 1;
});
