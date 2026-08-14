import { describe, expect, it, vi } from "vitest";
import { createEmptyProfile } from "../../../shared/domain/profile";
import { HttpProfileRepository, ProfileHostClientError } from "../src/client";

const ETAG_1 = `"${"a".repeat(43)}"`;
const ETAG_2 = `"${"b".repeat(43)}"`;
const ETAG_3 = `"${"c".repeat(43)}"`;
const ETAG_4 = `"${"d".repeat(43)}"`;

describe("HttpProfileRepository", () => {
  it("adapts load/save/clear to the authenticated host contract without extension APIs", async () => {
    const profile = createEmptyProfile();
    const request = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(JSON.stringify({ csrfToken: "c".repeat(43), expiresAt: Date.now() + 1000 }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ profile }), { status: 200, headers: { ETag: ETAG_1 } }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ profile }), { status: 200, headers: { ETag: ETAG_2 } }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ profile }), { status: 200, headers: { ETag: ETAG_1 } }));
    const repository = new HttpProfileRepository("", request);

    await expect(repository.load()).resolves.toEqual(profile);
    await expect(repository.save(profile)).resolves.toEqual(profile);
    await expect(repository.clear()).resolves.toEqual(profile);

    expect(request.mock.calls.map(([url]) => url)).toEqual([
      "/api/session",
      "/api/profile",
      "/api/profile",
      "/api/profile"
    ]);
    const saveHeaders = new Headers(request.mock.calls[2]?.[1]?.headers);
    expect(saveHeaders.get("if-match")).toBe(ETAG_1);
    expect(saveHeaders.get("x-profile-csrf")).toBe("c".repeat(43));
    expect(request.mock.calls[3]?.[1]?.method).toBe("DELETE");
  });

  it("requires load before a mutation and returns only a generic client error", async () => {
    const request = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify({ csrfToken: "c".repeat(43), expiresAt: Date.now() + 1000 }), { status: 200 })
    );
    const repository = new HttpProfileRepository("", request);
    await expect(repository.save(createEmptyProfile())).rejects.toEqual(
      expect.objectContaining<Partial<ProfileHostClientError>>({ status: 428 })
    );
  });

  it("uses CSRF for preview and binds confirm/rollback to the current ETag", async () => {
    const profile = createEmptyProfile();
    const preview = {
      confirmationToken: `import_${"i".repeat(43)}`,
      expiresAt: "2026-08-13T00:05:00.000Z",
      expectedCurrentProfileVersion: "pv_current",
      sourceFormat: "profile-service-v1",
      authenticityVerified: false,
      changedPathCount: 1,
      conflictPathCount: 0,
      changedPaths: ["basic.fullName"],
      conflictPaths: [],
      pathsTruncated: false
    } as const;
    const request = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(JSON.stringify({ csrfToken: "c".repeat(43), expiresAt: Date.now() + 1000 }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ profile }), { status: 200, headers: { ETag: ETAG_2 } }))
      .mockResolvedValueOnce(new Response(JSON.stringify(preview), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ profile, rollback: {
        rollbackToken: `rollback_${"r".repeat(43)}`,
        expiresAt: "2026-08-13T00:05:00.000Z",
        expectedImportedProfileVersion: "pv_imported"
      } }), { status: 200, headers: { ETag: ETAG_3 } }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ profile }), { status: 200, headers: { ETag: ETAG_4 } }));
    const repository = new HttpProfileRepository("", request);
    await repository.load();
    await repository.previewImport("serialized");
    await repository.confirmImport({
      confirmationToken: preview.confirmationToken,
      expectedCurrentProfileVersion: preview.expectedCurrentProfileVersion,
      serialized: "serialized"
    });
    await repository.rollbackImport({
      rollbackToken: `rollback_${"r".repeat(43)}`,
      expectedImportedProfileVersion: "pv_imported"
    });

    const previewHeaders = new Headers(request.mock.calls[2]?.[1]?.headers);
    expect(previewHeaders.get("x-profile-csrf")).toBe("c".repeat(43));
    expect(previewHeaders.get("if-match")).toBeNull();
    expect(new Headers(request.mock.calls[3]?.[1]?.headers).get("if-match")).toBe(ETAG_2);
    expect(new Headers(request.mock.calls[4]?.[1]?.headers).get("if-match")).toBe(ETAG_3);
  });
});
