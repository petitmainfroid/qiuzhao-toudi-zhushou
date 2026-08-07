import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { createEmptyProfile, type CandidateProfile } from "../domain/profile";
import type { SavedResumeRepositoryLike } from "../storage/savedResumeRepository";
import { ProfileEditor, type ProfileRepositoryLike } from "./App";

vi.mock("../resume/extractResumeText", () => ({
  extractResumeText: vi.fn(async () => ({
    format: "docx",
    text: `沈言
手机：13900001111
邮箱：shen.yan@example.com
现居城市：上海
教育经历
2022.09 - 2026.06 复旦大学 软件工程 本科 统招全日制
实习经历
2025.06 - 2025.09 青禾研究院 算法实习生
• 建立匿名评测集。
2024.07 - 2024.09 云岫实验室 研究助理
• 复现实验并记录结论。
项目经历
2024.10 - 2025.03 匿名匹配工具 项目负责人
• 实现确定性字段匹配。
项目成果：覆盖匿名字段样本。
2023.10 - 2024.03 匿名检查工具 核心成员
• 实现记录顺序检查。
项目成果：形成匿名回归样本。`
  }))
}));

function createRepository(profile: CandidateProfile = createEmptyProfile()) {
  const repository: ProfileRepositoryLike = {
    load: vi.fn(async () => structuredClone(profile)),
    save: vi.fn(async (next) => ({
      ...structuredClone(next),
      updatedAt: "2026-08-03T10:00:00.000Z"
    }))
  };
  return repository;
}

describe("ProfileEditor", () => {
  it("saves a selected PDF as the reusable local resume", async () => {
    const bytes = new TextEncoder().encode("%PDF-1.4\nreusable unit resume\n%%EOF");
    const file = new File([bytes], "reusable-resume.pdf", { type: "application/pdf" });
    const savedResumeRepository: SavedResumeRepositoryLike = {
      load: vi.fn(async () => null),
      save: vi.fn(async (selected) => ({
        file: selected,
        name: selected.name,
        mimeType: "application/pdf" as const,
        size: selected.size,
        sha256: "a".repeat(64),
        savedAt: "2026-08-06T08:00:00.000Z"
      })),
      clear: vi.fn(async () => undefined)
    };
    render(<ProfileEditor repository={createRepository()} savedResumeRepository={savedResumeRepository} />);

    fireEvent.change(await screen.findByLabelText("上传简历并解析"), { target: { files: [file] } });

    await waitFor(() => expect(savedResumeRepository.save).toHaveBeenCalledWith(file));
    expect(await screen.findByText("reusable-resume.pdf", { exact: false })).toBeInTheDocument();
    expect(screen.getByText("已保存常用 PDF")).toBeInTheDocument();
  });

  it("edits and saves basic profile data", async () => {
    const repository = createRepository();
    render(<ProfileEditor repository={repository} />);

    fireEvent.change(await screen.findByLabelText("姓名"), {
      target: { value: "保存测试" }
    });
    fireEvent.change(screen.getByLabelText("手机号码"), {
      target: { value: "13800000000" }
    });
    fireEvent.click(screen.getAllByRole("button", { name: "保存档案" })[0]);

    await waitFor(() => expect(repository.save).toHaveBeenCalledTimes(1));
    expect(repository.save).toHaveBeenCalledWith(
      expect.objectContaining({
        basic: expect.objectContaining({ fullName: "保存测试" })
      })
    );
    expect(await screen.findByText(/已保存于/)).toBeInTheDocument();
  });

  it("adds and removes repeatable project records", async () => {
    render(<ProfileEditor repository={createRepository()} />);
    await screen.findByRole("heading", { name: "项目经历" });

    fireEvent.click(screen.getByRole("button", { name: "添加一段项目经历" }));
    expect(screen.getByRole("heading", { name: "项目经历 1" })).toBeInTheDocument();
    expect(screen.getByLabelText("项目名称")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "删除项目经历 1" }));
    expect(screen.queryByRole("heading", { name: "项目经历 1" })).not.toBeInTheDocument();
  });

  it("edits and saves the expanded reusable information sections", async () => {
    const repository = createRepository();
    render(<ProfileEditor repository={repository} />);

    expect(await screen.findByRole("heading", { name: "校园经历" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "证书信息" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "论文与专利" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "家庭与紧急联系人" })).toBeInTheDocument();
    expect(screen.getByText(/家庭成员资料涉及第三方隐私/)).toBeInTheDocument();
    expect(screen.getByText(/证件资料会保存在这台设备.*目前尚未加密/)).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("民族"), { target: { value: "汉族" } });
    fireEvent.change(screen.getByLabelText("证件类型"), { target: { value: "居民身份证" } });
    fireEvent.change(screen.getByLabelText("证件号码"), { target: { value: "TEST-ID-000042" } });
    fireEvent.change(screen.getByLabelText("期望行业"), { target: { value: "企业服务" } });

    fireEvent.click(screen.getByRole("button", { name: "添加一段在校职务" }));
    fireEvent.change(screen.getByLabelText("职务名称"), { target: { value: "学生会负责人" } });
    fireEvent.change(screen.getByLabelText("职务描述"), { target: { value: "组织真实校园活动。" } });

    fireEvent.click(screen.getByRole("button", { name: "添加一项证书" }));
    fireEvent.change(screen.getByLabelText("证书名称"), { target: { value: "测试资格证书" } });

    fireEvent.click(screen.getByRole("button", { name: "添加一篇论文" }));
    fireEvent.change(screen.getByLabelText("论文名称"), { target: { value: "匿名论文标题" } });

    fireEvent.click(screen.getByRole("button", { name: "添加一项专利" }));
    fireEvent.change(screen.getByLabelText("专利名称"), { target: { value: "匿名专利名称" } });

    fireEvent.click(screen.getByRole("button", { name: "添加一位家庭成员" }));
    fireEvent.change(screen.getByLabelText("家庭成员姓名"), { target: { value: "经同意的联系人" } });
    fireEvent.change(screen.getByLabelText("与本人关系"), { target: { value: "家属" } });

    fireEvent.click(screen.getAllByRole("button", { name: "保存档案" })[0]);
    await waitFor(() => expect(repository.save).toHaveBeenCalledWith(expect.objectContaining({
      basic: expect.objectContaining({
        ethnicity: "汉族",
        identityDocumentType: "居民身份证",
        identityDocumentNumber: "TEST-ID-000042"
      }),
      jobPreference: expect.objectContaining({ targetIndustries: "企业服务" }),
      campusLeadership: [expect.objectContaining({ title: "学生会负责人" })],
      certificates: [expect.objectContaining({ name: "测试资格证书" })],
      publications: [expect.objectContaining({ title: "匿名论文标题" })],
      patents: [expect.objectContaining({ name: "匿名专利名称" })],
      familyMembers: [expect.objectContaining({ relationship: "家属" })]
    })));
  });

  it("shows validation feedback and blocks invalid saves", async () => {
    const repository = createRepository();
    render(<ProfileEditor repository={repository} />);

    fireEvent.change(await screen.findByLabelText("邮箱"), {
      target: { value: "invalid-email" }
    });
    expect(screen.getByText("请输入有效的邮箱地址。")).toBeInTheDocument();
    fireEvent.click(screen.getAllByRole("button", { name: "保存档案" })[0]);

    expect(repository.save).not.toHaveBeenCalled();
    expect(screen.getByText(/请先修正标出的格式或日期问题/)).toBeInTheDocument();
  });

  it("puts parsed resume values directly into the existing form before explicit save", async () => {
    const existing = createEmptyProfile();
    existing.basic.currentCity = "杭州";
    const repository = createRepository(existing);
    render(<ProfileEditor repository={repository} />);

    const upload = await screen.findByLabelText("上传简历并解析");
    fireEvent.change(upload, {
      target: {
        files: [new File(["mocked docx"], "campus-resume.docx", {
          type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        })]
      }
    });

    expect(await screen.findByDisplayValue("沈言")).toBeInTheDocument();
    expect(screen.getByLabelText("邮箱")).toHaveValue("shen.yan@example.com");
    expect(screen.getByLabelText("当前城市")).toHaveValue("杭州");
    expect(screen.getByLabelText("院校名称")).toHaveValue("复旦大学");
    expect(screen.getAllByLabelText("公司名称")).toHaveLength(2);
    expect(screen.getAllByLabelText("公司名称").map((field) => (field as HTMLInputElement).value))
      .toEqual(["青禾研究院", "云岫实验室"]);
    expect(screen.getAllByLabelText("岗位名称").map((field) => (field as HTMLInputElement).value))
      .toEqual(["算法实习生", "研究助理"]);
    expect(screen.getAllByLabelText("项目名称").map((field) => (field as HTMLInputElement).value))
      .toEqual(["匿名匹配工具", "匿名检查工具"]);
    expect(screen.getAllByLabelText("承担角色").map((field) => (field as HTMLInputElement).value))
      .toEqual(["项目负责人", "核心成员"]);
    expect(screen.getAllByLabelText("项目成果").map((field) => (field as HTMLTextAreaElement).value))
      .toEqual(["覆盖匿名字段样本。", "形成匿名回归样本。"]);
    expect(screen.getByText(/保留了 1 个已有非空值/)).toBeInTheDocument();
    expect(repository.save).not.toHaveBeenCalled();
    expect(screen.getAllByText("有未保存的更改")).toHaveLength(2);

    fireEvent.click(screen.getAllByRole("button", { name: "保存档案" })[0]);
    await waitFor(() => expect(repository.save).toHaveBeenCalledWith(
      expect.objectContaining({
        basic: expect.objectContaining({ fullName: "沈言", currentCity: "杭州" }),
        education: expect.arrayContaining([expect.objectContaining({ school: "复旦大学" })]),
        workExperiences: [
          expect.objectContaining({ company: "青禾研究院", role: "算法实习生" }),
          expect.objectContaining({ company: "云岫实验室", role: "研究助理" })
        ],
        projects: [
          expect.objectContaining({ name: "匿名匹配工具", role: "项目负责人" }),
          expect.objectContaining({ name: "匿名检查工具", role: "核心成员" })
        ]
      })
    ));
  });
});
