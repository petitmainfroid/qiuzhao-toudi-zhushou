import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { PrivacySafePageState, PowerSessionView } from "../../bridge/protocol";
import type { AtsObservation } from "../../ats/contracts";
import type { PowerSessionBridge } from "../../sidepanel/powerSessionBridge";
import { AtsCollectorCard } from "./AtsCollectorCard";

function pageState(): PrivacySafePageState {
  return {
    snapshotId: "snapshot_private_123",
    origin: "https://xiaomi.jobs.example.test",
    path: "/internship/resume/7663053400020879658/apply",
    sections: ["教育经历"],
    controls: [
      {
        ref: "opaque-private-reference",
        role: "textbox",
        tag: "input",
        inputType: "text",
        semantics: { label: "学校名称", name: "education_list[0].school" },
        disabled: false,
        readOnly: false,
        required: true,
        multiple: false,
        boundary: "main",
        safety: "ordinary"
      },
      {
        ref: "opaque-submit-reference",
        role: "button",
        tag: "button",
        semantics: { label: "最终投递" },
        disabled: false,
        readOnly: false,
        required: false,
        multiple: false,
        boundary: "main",
        safety: "final-submit"
      }
    ],
    summary: {
      controlCount: 2,
      frameCount: 1,
      openShadowRootCount: 0,
      blockedControlCount: 1,
      sectionCount: 1
    }
  };
}

function bridge(overrides: Partial<PowerSessionBridge> = {}): PowerSessionBridge {
  return {
    status: vi.fn().mockResolvedValue({ status: "inactive", reason: "not-started" } satisfies PowerSessionView),
    start: vi.fn().mockResolvedValue({ status: "active" } satisfies PowerSessionView),
    refresh: vi.fn(),
    pageState: vi.fn().mockResolvedValue(pageState()),
    find: vi.fn(),
    stop: vi.fn(),
    ...overrides
  };
}

describe("AtsCollectorCard", () => {
  it("waits for an explicit gesture, previews an audited observation, and downloads only on confirmation", async () => {
    const collectorBridge = bridge();
    const download = vi.fn<(observation: AtsObservation) => void>();
    render(
      <AtsCollectorCard
        bridge={collectorBridge}
        download={download}
        now={() => new Date("2026-08-06T12:30:00.000Z")}
        captureToolVersion="0.2.0"
        language="zh-CN"
      />
    );

    expect(collectorBridge.status).not.toHaveBeenCalled();
    expect(collectorBridge.pageState).not.toHaveBeenCalled();
    expect(download).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "采集匿名结构" }));
    await screen.findByText("隐私检查和独立覆盖验收通过。请先查看预览，再下载匿名 JSON。");

    expect(collectorBridge.start).toHaveBeenCalledTimes(1);
    expect(collectorBridge.pageState).toHaveBeenCalledTimes(1);
    expect(screen.getByText("/internship/resume/:id/apply")).toBeInTheDocument();
    expect(screen.getByText("2 个 · 限制 1 个")).toBeInTheDocument();
    expect(screen.getByText("学校名称")).toBeInTheDocument();
    expect(download).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "下载匿名 JSON" }));
    expect(download).toHaveBeenCalledTimes(1);
    const observation = download.mock.calls[0][0];
    const serialized = JSON.stringify(observation);
    expect(observation.source).toMatchObject({
      origin: "https://xiaomi.jobs.example.test",
      pathTemplate: "/internship/resume/:id/apply",
      pageType: "application"
    });
    expect(observation.family.id).toBe("generic-html");
    expect(observation.controls.map((control) => control.controlKey)).toEqual(["control_0001", "control_0002"]);
    expect(serialized).not.toContain("snapshot_private_123");
    expect(serialized).not.toContain("opaque-private-reference");
    expect(serialized).not.toContain("7663053400020879658");
    expect(await screen.findByText("匿名 JSON 已交给浏览器下载；扩展没有保存或上传副本。")).toBeInTheDocument();
  });

  it("reuses an active bounded session and fails closed without exposing the cause", async () => {
    const collectorBridge = bridge({
      status: vi.fn().mockResolvedValue({ status: "active" }),
      pageState: vi.fn().mockRejectedValue(new Error("candidate@example.com C:\\Users\\candidate\\resume.pdf"))
    });
    render(<AtsCollectorCard bridge={collectorBridge} download={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: "采集匿名结构" }));
    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent("采集已停止");
    });
    expect(collectorBridge.start).not.toHaveBeenCalled();
    expect(screen.queryByText(/candidate@example\.com/)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "下载匿名 JSON" })).not.toBeInTheDocument();
  });

  it("blocks a Xiaomi download when the independent nine-section baseline is incomplete", async () => {
    const incomplete = pageState();
    incomplete.origin = "https://xiaomi.jobs.f.mioffice.cn";
    const download = vi.fn();
    render(<AtsCollectorCard bridge={bridge({ pageState: vi.fn().mockResolvedValue(incomplete) })} download={download} />);

    fireEvent.click(screen.getByRole("button", { name: "采集匿名结构" }));
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("独立覆盖验收未通过"));
    expect(screen.getByText("1 / 9")).toBeInTheDocument();
    expect(screen.getByText(/缺少分组/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "下载匿名 JSON" })).not.toBeInTheDocument();
    expect(download).not.toHaveBeenCalled();
  });
});
