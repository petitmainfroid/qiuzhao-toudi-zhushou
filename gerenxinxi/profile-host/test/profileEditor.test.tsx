// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createEmptyProfile } from "../../../shared/domain/profile";
import { ProfileEditor } from "../../../shared/options/App";
import { HttpProfileRepository } from "../src/client";

const ETAG_1 = `"${"a".repeat(43)}"`;
const ETAG_2 = `"${"b".repeat(43)}"`;
const ETAG_3 = `"${"c".repeat(43)}"`;

afterEach(cleanup);

describe("ProfileEditor host integration", () => {
  it("loads, saves, and clears through HttpProfileRepository", async () => {
    const profile = createEmptyProfile();
    profile.basic.fullName = "Synthetic Candidate";
    const empty = createEmptyProfile();
    const request = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(JSON.stringify({ csrfToken: "z".repeat(43), expiresAt: Date.now() + 10_000 }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ profile }), { status: 200, headers: { ETag: ETAG_1 } }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ profile: { ...profile, basic: { ...profile.basic, fullName: "Changed Name" } } }), { status: 200, headers: { ETag: ETAG_2 } }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ profile: empty }), { status: 200, headers: { ETag: ETAG_3 } }));
    const repository = new HttpProfileRepository("", request);
    render(<ProfileEditor repository={repository} localDataRepository={repository} />);

    const name = await screen.findByLabelText("姓名");
    expect(screen.getByRole("heading", { name: "建立一次，后续重复使用" })).toBeTruthy();
    expect(screen.getByRole("navigation", { name: "档案导航" })).toBeTruthy();
    expect(screen.getByRole("complementary", { name: "档案章节" })).toBeTruthy();
    expect(screen.getByRole("complementary", { name: "档案管理" })).toBeTruthy();
    expect((name as HTMLInputElement).value).toBe("Synthetic Candidate");
    fireEvent.change(name, { target: { value: "Changed Name" } });
    fireEvent.click(screen.getAllByRole("button", { name: "保存档案" })[0]!);
    await waitFor(() => expect(request).toHaveBeenCalledTimes(3));
    expect(JSON.parse(String(request.mock.calls[2]?.[1]?.body)).profile.basic.fullName).toBe("Changed Name");

    fireEvent.click(screen.getByRole("button", { name: "删除全部本地数据" }));
    fireEvent.click(screen.getByRole("button", { name: "确认永久删除" }));
    await waitFor(() => expect(request).toHaveBeenCalledTimes(4));
    expect(request.mock.calls[3]?.[1]?.method).toBe("DELETE");
  });

  it("saves a selected PDF through the injected host repository even when text parsing later fails", async () => {
    const profile = createEmptyProfile();
    const metadata = {
      name: "candidate.pdf",
      mimeType: "application/pdf" as const,
      size: 16,
      sha256: "a".repeat(64),
      savedAt: "2026-08-13T00:00:00.000Z"
    };
    const savedResumeRepository = {
      load: vi.fn(async () => null),
      save: vi.fn(async () => metadata),
      clear: vi.fn(async () => undefined)
    };
    render(
      <ProfileEditor
        repository={{ load: async () => profile, save: async (value) => value }}
        savedResumeRepository={savedResumeRepository}
      />
    );

    const upload = await screen.findByLabelText("上传简历并解析");
    const file = new File(["%PDF-1.7\n%%EOF"], "candidate.pdf", { type: "application/pdf" });
    await userEvent.upload(upload, file);

    await waitFor(() => expect(savedResumeRepository.save).toHaveBeenCalledWith(file));
    expect(await screen.findByText(/candidate\.pdf/)).toBeTruthy();
    expect(screen.getByText("已保存常用 PDF")).toBeTruthy();
  });
});
