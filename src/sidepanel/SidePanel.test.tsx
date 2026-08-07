import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { createEmptyProfile, type CandidateProfile } from "../domain/profile";
import type { FillSelection, ScanResult } from "../content/engine";
import type { PageBridge } from "./pageBridge";
import type { SavedResumeRepositoryLike } from "../storage/savedResumeRepository";
import { SidePanel } from "./App";

function profileWithValues() {
  const profile = createEmptyProfile();
  profile.basic.fullName = "侧栏测试";
  profile.basic.email = "panel@example.test";
  profile.basic.birthDate = "2003-08-01";
  profile.projects.push({
    id: "panel-project",
    name: "",
    role: "",
    startDate: "",
    endDate: "",
    description: "需要确认的项目描述",
    outcome: "",
    link: ""
  });
  return profile;
}

function scanResult(): ScanResult {
  return {
    title: "侧栏测试页面",
    site: "https://jobs.example",
    fields: [
      {
        elementId: "name",
        fingerprint: "text|name",
        mappingSource: "rule",
        fieldLabel: "姓名",
        profilePath: "basic.fullName",
        canonicalLabel: "姓名",
        score: 0.98,
        confidence: "high",
        reasons: ["标题完全一致"],
        requiresConfirmation: false,
        hasValue: true,
        valuePreview: "侧栏测试",
        comparisonStatus: "empty"
      },
      {
        elementId: "birth",
        fingerprint: "date|birth",
        mappingSource: "rule",
        fieldLabel: "出生日期",
        profilePath: "basic.birthDate",
        canonicalLabel: "出生日期",
        score: 0.98,
        confidence: "high",
        reasons: ["敏感信息需要确认"],
        requiresConfirmation: true,
        hasValue: true,
        valuePreview: "2003-08-01",
        comparisonStatus: "conflict",
        comparisonToken: "comparison-birth"
      },
      {
        elementId: "project",
        fingerprint: "textarea|project",
        mappingSource: "rule",
        fieldLabel: "项目介绍",
        profilePath: "projects.0.description",
        canonicalLabel: "项目描述",
        score: 0.72,
        confidence: "medium",
        reasons: ["上下文需要确认"],
        requiresConfirmation: true,
        hasValue: true,
        valuePreview: "需要确认的项目描述",
        comparisonStatus: "empty"
      },
      {
        elementId: "file",
        fingerprint: "file|resume",
        mappingSource: "rule",
        fieldLabel: "上传简历",
        profilePath: null,
        canonicalLabel: null,
        score: 0,
        confidence: "none",
        reasons: ["文件选择必须由用户完成"],
        requiresConfirmation: true,
        excludedReason: "unsupported-control",
        hasValue: false,
        valuePreview: "",
        comparisonStatus: "unreadable"
      }
    ],
    resumeAttachment: {
      status: "ready",
      candidateCount: 1,
      candidate: {
        elementId: "resume-file",
        fieldLabel: "上传简历",
        destinationOrigin: "https://jobs.example",
        acceptsPdf: true
      }
    },
    summary: {
      total: 4,
      fillable: 3,
      high: 1,
      needsConfirmation: 2,
      excluded: 1,
      empty: 2,
      equal: 0,
      conflict: 1,
      unreadable: 1
    }
  };
}

describe("SidePanel", () => {
  it("restores a saved PDF and still requires destination confirmation", async () => {
    const bytes = new TextEncoder().encode("%PDF-1.4\nrestored unit resume\n%%EOF");
    const file = new File([bytes], "restored-resume.pdf", { type: "application/pdf" });
    const savedResumeRepository: SavedResumeRepositoryLike = {
      load: vi.fn(async () => ({
        file,
        name: file.name,
        mimeType: "application/pdf" as const,
        size: file.size,
        sha256: "b".repeat(64),
        savedAt: "2026-08-06T08:00:00.000Z"
      })),
      save: vi.fn(),
      clear: vi.fn()
    };
    const bridge: PageBridge = {
      scan: vi.fn(async () => scanResult()),
      fill: vi.fn(),
      attachResume: vi.fn(async () => ({ status: "attached" as const }))
    };
    render(<SidePanel
      repository={{ load: async () => profileWithValues() }}
      savedResumeRepository={savedResumeRepository}
      pageBridge={bridge}
    />);

    fireEvent.click(await screen.findByRole("button", { name: "自动填写当前页面" }));
    expect(await screen.findByText("restored-resume.pdf")).toBeInTheDocument();
    expect(screen.getByText("已保存于本机，可长期复用")).toBeInTheDocument();
    expect(bridge.attachResume).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "确认上传到 jobs.example" }));
    await waitFor(() => expect(bridge.attachResume).toHaveBeenCalledWith(
      file,
      expect.any(Object),
      "b".repeat(64),
      expect.any(Number)
    ));
  });

  it("concentrates exceptions and continues with the safe plan by default", async () => {
    const profile = profileWithValues();
    const bridge: PageBridge = {
      scan: vi.fn(async () => scanResult()),
      fill: vi.fn(async (_profile: CandidateProfile, selections: FillSelection[]) => ({
        outcomes: selections.map((selection: FillSelection) => ({ ...selection, status: "filled" as const })),
        filledCount: selections.length,
        skippedCount: 0
      }))
    };
    render(<SidePanel repository={{ load: async () => profile }} pageBridge={bridge} />);

    expect(screen.queryByRole("button", { name: "扫描当前页面" })).not.toBeInTheDocument();
    fireEvent.click(await screen.findByRole("button", { name: "自动填写当前页面" }));
    await screen.findByRole("heading", { name: "侧栏测试页面" });
    expect(screen.getByRole("heading", { name: "只处理这 2 个例外" })).toBeInTheDocument();
    expect(screen.getByLabelText("确认填写 出生日期")).not.toBeChecked();
    expect(screen.getByLabelText("确认填写 项目介绍")).not.toBeChecked();
    expect(screen.getByText("未匹配或已跳过 1 项")).toBeInTheDocument();
    expect(bridge.fill).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "确认并继续填写 1 项" }));
    await waitFor(() => expect(bridge.fill).toHaveBeenCalledTimes(1));
    expect(bridge.fill).toHaveBeenCalledWith(profile, [
      { elementId: "name", profilePath: "basic.fullName" }
    ], []);
    expect(await screen.findByText(/已填写 1 项/)).toBeInTheDocument();
  });

  it("allows explicit confirmation selections", async () => {
    const bridge: PageBridge = {
      scan: vi.fn(async () => scanResult()),
      fill: vi.fn(async (_profile: CandidateProfile, selections: FillSelection[]) => ({ outcomes: [], filledCount: selections.length, skippedCount: 0 }))
    };
    render(<SidePanel repository={{ load: async () => profileWithValues() }} pageBridge={bridge} />);

    fireEvent.click(await screen.findByRole("button", { name: "自动填写当前页面" }));
    await screen.findByLabelText("确认填写 出生日期");
    fireEvent.click(screen.getByLabelText("确认填写 出生日期"));
    fireEvent.click(screen.getByLabelText("确认填写 项目介绍"));
    expect(screen.getByRole("button", { name: "确认并继续填写 3 项" })).toBeEnabled();
  });

  it("saves and reapplies a user field correction", async () => {
    const profile = profileWithValues();
    const mapping = {
      site: "https://jobs.example",
      fingerprint: "text|name",
      profilePath: "basic.email",
      canonicalLabel: "邮箱",
      updatedAt: "2026-08-03T12:00:00.000Z"
    };
    const mappingRepository = {
      load: vi.fn(async () => []),
      save: vi.fn(async () => [mapping])
    };
    const bridge: PageBridge = {
      scan: vi.fn(async (_profile, mappings = []) => {
        const result = scanResult();
        if (mappings.length > 0) {
          result.fields[0] = {
            ...result.fields[0],
            profilePath: "basic.email",
            canonicalLabel: "邮箱",
            mappingSource: "saved",
            valuePreview: "panel@example.test",
            reasons: ["使用你为此网站保存的字段对应关系"]
          };
        }
        return result;
      }),
      fill: vi.fn()
    };
    render(<SidePanel repository={{ load: async () => profile }} mappingRepository={mappingRepository} pageBridge={bridge} />);

    fireEvent.click(await screen.findByRole("button", { name: "自动填写当前页面" }));
    fireEvent.click(await screen.findByText("查看自动匹配详情 1 项"));
    const nameFieldSelect = screen.getByLabelText("更改 姓名 对应字段");
    const matchDetails = nameFieldSelect.closest("details")?.querySelector("summary");
    expect(matchDetails).not.toBeNull();
    fireEvent.click(matchDetails!);
    fireEvent.change(nameFieldSelect, { target: { value: "basic.email" } });

    await waitFor(() => expect(mappingRepository.save).toHaveBeenCalledWith({
      site: "https://jobs.example",
      fingerprint: "text|name",
      profilePath: "basic.email",
      canonicalLabel: "邮箱"
    }));
    expect(await screen.findByText(/已记住“姓名”/)).toBeInTheDocument();
    expect(screen.getByText("已记住")).toBeInTheDocument();
  });

  it("shows the exact file, digest, site, and control before explicit attachment", async () => {
    const bridge: PageBridge = {
      scan: vi.fn(async () => scanResult()),
      fill: vi.fn(),
      attachResume: vi.fn(async () => ({ status: "attached" as const }))
    };
    render(<SidePanel repository={{ load: async () => profileWithValues() }} pageBridge={bridge} />);

    fireEvent.click(await screen.findByRole("button", { name: "自动填写当前页面" }));
    const input = await screen.findByLabelText("选择要附加的 PDF 简历");
    const bytes = new TextEncoder().encode("%PDF-1.4\nsynthetic sidepanel attachment\n%%EOF");
    const file = new File([bytes], "synthetic-resume.pdf", { type: "application/pdf" });
    Object.defineProperty(file, "arrayBuffer", { value: async () => bytes.buffer.slice(0) });
    fireEvent.change(input, { target: { files: [file] } });

    expect(await screen.findByText("synthetic-resume.pdf")).toBeInTheDocument();
    expect(screen.getByText("https://jobs.example")).toBeInTheDocument();
    expect(screen.getByText("SHA-256", { exact: false })).toBeInTheDocument();
    expect(bridge.attachResume).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "确认上传到 jobs.example" }));
    await waitFor(() => expect(bridge.attachResume).toHaveBeenCalledWith(
      file,
      expect.objectContaining({ elementId: "resume-file", destinationOrigin: "https://jobs.example" }),
      expect.stringMatching(/^[a-f0-9]{64}$/),
      expect.any(Number)
    ));
    expect(await screen.findByText(/简历已附加/)).toBeInTheDocument();
  });

  it("fills a safe-only page from the single primary action", async () => {
    const profile = profileWithValues();
    const safeOnly = scanResult();
    safeOnly.fields = safeOnly.fields.filter((field) => ["name", "file"].includes(field.elementId));
    const bridge: PageBridge = {
      scan: vi.fn(async () => safeOnly),
      fill: vi.fn(async (_profile, selections) => ({
        outcomes: selections.map((selection: FillSelection) => ({ ...selection, status: "filled" as const })),
        filledCount: selections.length,
        skippedCount: 0
      }))
    };
    render(<SidePanel repository={{ load: async () => profile }} pageBridge={bridge} />);

    fireEvent.click(await screen.findByRole("button", { name: "自动填写当前页面" }));

    await waitFor(() => expect(bridge.scan).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(bridge.fill).toHaveBeenCalledTimes(1));
    expect(screen.queryByText("填写前集中确认")).not.toBeInTheDocument();
    expect(await screen.findByText(/已填写 1 项/)).toBeInTheDocument();
  });

  it("keeps manual recovery secondary and sends only one explicitly selected non-sensitive value", async () => {
    const profile = profileWithValues();
    const bridge: PageBridge = {
      scan: vi.fn(async () => scanResult()),
      fill: vi.fn(),
      getFocusedRecoveryTarget: vi.fn(async () => ({
        status: "ready" as const,
        token: "focused-unit-token",
        fieldLabel: "未匹配的作品链接",
        controlKind: "text",
        expiresInMs: 60_000
      })),
      fillFocusedRecovery: vi.fn(async () => ({
        status: "filled" as const,
        fieldLabel: "未匹配的作品链接",
        canonicalLabel: "邮箱"
      }))
    };
    render(<SidePanel repository={{ load: async () => profile }} pageBridge={bridge} />);

    expect(screen.queryByText("某个字段没填上？")).not.toBeInTheDocument();
    fireEvent.click(await screen.findByRole("button", { name: "自动填写当前页面" }));
    const recoverySummary = await screen.findByText("某个字段没填上？");
    const recoveryDetails = recoverySummary.closest("details");
    expect(recoveryDetails).not.toBeNull();
    fireEvent.click(recoverySummary);
    fireEvent.click(screen.getByRole("button", { name: "读取刚刚聚焦的字段" }));

    expect(await screen.findByText("已锁定：未匹配的作品链接")).toBeInTheDocument();
    expect(Array.from(recoveryDetails!.querySelectorAll("option"), (option) => option.textContent))
      .not.toContain("出生日期");
    expect(recoveryDetails).not.toHaveTextContent("panel@example.test");
    expect(recoveryDetails).not.toHaveTextContent("2003-08-01");
    fireEvent.change(screen.getByLabelText("选择要补填的档案字段"), {
      target: { value: "basic.email" }
    });
    fireEvent.click(screen.getByRole("button", { name: "填写这个字段" }));

    await waitFor(() => expect(bridge.fillFocusedRecovery).toHaveBeenCalledWith(
      "focused-unit-token",
      "basic.email",
      "panel@example.test"
    ));
    expect(await screen.findByText(/写入“未匹配的作品链接”并回读确认/)).toBeInTheDocument();
  });
});
