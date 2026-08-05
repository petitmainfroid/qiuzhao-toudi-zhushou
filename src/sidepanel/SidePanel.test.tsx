import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { createEmptyProfile, type CandidateProfile } from "../domain/profile";
import type { FillSelection, ScanResult } from "../content/engine";
import type { PageBridge } from "./pageBridge";
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
  it("defaults to safe high-confidence selections only", async () => {
    const profile = profileWithValues();
    const bridge: PageBridge = {
      scan: vi.fn(async () => scanResult()),
      fill: vi.fn(async (_profile: CandidateProfile, selections: FillSelection[]) => ({
        outcomes: selections.map((selection) => ({ ...selection, status: "filled" as const })),
        filledCount: selections.length,
        skippedCount: 0
      }))
    };
    render(<SidePanel repository={{ load: async () => profile }} pageBridge={bridge} />);

    fireEvent.click(await screen.findByRole("button", { name: "扫描当前页面" }));
    await screen.findByRole("heading", { name: "侧栏测试页面" });
    expect(screen.getByLabelText("选择 姓名")).toBeChecked();
    expect(screen.getByLabelText("选择 出生日期")).not.toBeChecked();
    expect(screen.getByLabelText("选择 项目介绍")).not.toBeChecked();
    expect(screen.getByText("未匹配或已跳过 1 项")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "填写已选 1 项" }));
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

    fireEvent.click(await screen.findByRole("button", { name: "扫描当前页面" }));
    await screen.findByLabelText("选择 出生日期");
    fireEvent.click(screen.getByLabelText("选择 出生日期"));
    fireEvent.click(screen.getByLabelText("选择 项目介绍"));
    expect(screen.getByRole("button", { name: "填写已选 3 项" })).toBeEnabled();
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

    fireEvent.click(await screen.findByRole("button", { name: "扫描当前页面" }));
    const matchDetails = await screen.findAllByText("为什么这样匹配");
    fireEvent.click(matchDetails[0]);
    fireEvent.change(screen.getByLabelText("更改 姓名 对应字段"), { target: { value: "basic.email" } });

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

    fireEvent.click(await screen.findByRole("button", { name: "扫描当前页面" }));
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
});
