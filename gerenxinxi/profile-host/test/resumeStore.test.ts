import { mkdtemp, readFile, readdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { BinaryAtRestProtector } from "../../profile-service/src";
import { WindowsDpapiProtector } from "../../profile-service/src";
import { FileResumeStore, ResumeStoreError } from "../src";

const testProtector: BinaryAtRestProtector = {
  providerId: "synthetic-binary-protector",
  async protect(plaintext) {
    return `protected:${Buffer.from(plaintext, "utf8").toString("base64")}`;
  },
  async unprotect(payload) {
    if (!payload.startsWith("protected:")) throw new Error("invalid");
    return Buffer.from(payload.slice("protected:".length), "base64").toString("utf8");
  },
  async protectBytes(plaintext) {
    return `protected:${Buffer.from(plaintext).toString("base64")}`;
  },
  async unprotectBytes(payload) {
    if (!payload.startsWith("protected:")) throw new Error("invalid");
    return new Uint8Array(Buffer.from(payload.slice("protected:".length), "base64"));
  }
};

function pdf(label: string): Uint8Array {
  return new TextEncoder().encode(`%PDF-1.7\n${label}\n%%EOF`);
}

describe("FileResumeStore", () => {
  it("persists one encrypted PDF across repository restarts and replaces it deterministically", async () => {
    const directory = await mkdtemp(join(tmpdir(), "qiuzhao-resume-store-"));
    const filePath = join(directory, "resume.json");
    const first = new FileResumeStore({ filePath, protector: testProtector });
    const firstBytes = pdf("first-private-payload");
    const firstMetadata = await first.save({ name: "candidate.pdf", mimeType: "application/pdf", bytes: firstBytes });

    const disk = await readFile(filePath, "utf8");
    expect(disk).not.toContain("candidate.pdf");
    expect(disk).not.toContain("first-private-payload");
    expect(disk).not.toContain("%PDF-");

    const restarted = new FileResumeStore({ filePath, protector: testProtector });
    await expect(restarted.loadMetadata()).resolves.toEqual(firstMetadata);
    const restored = await restarted.load();
    expect(restored?.name).toBe("candidate.pdf");
    expect(Array.from(restored?.bytes ?? [])).toEqual(Array.from(firstBytes));
    restored?.bytes.fill(0);

    const replacement = pdf("replacement-private-payload");
    const replacementMetadata = await restarted.save({ name: "replacement.pdf", mimeType: "application/pdf", bytes: replacement });
    expect((await restarted.loadMetadata())?.sha256).toBe(replacementMetadata.sha256);
    expect((await readdir(directory)).filter((name) => name.endsWith(".tmp"))).toEqual([]);

    await restarted.clear();
    await expect(restarted.loadMetadata()).resolves.toBeNull();
  });

  it("fails closed for invalid input, relative paths, and tampered encrypted payloads", async () => {
    expect(() => new FileResumeStore({ filePath: "relative-resume.json", protector: testProtector }))
      .toThrow(expect.objectContaining<Partial<ResumeStoreError>>({ code: "resume_storage_failed" }));
    const directory = await mkdtemp(join(tmpdir(), "qiuzhao-resume-tamper-"));
    const filePath = join(directory, "resume.json");
    const store = new FileResumeStore({ filePath, protector: testProtector });
    await expect(store.save({ name: "fake.pdf", mimeType: "application/pdf", bytes: new TextEncoder().encode("not-pdf") }))
      .rejects.toEqual(expect.objectContaining<Partial<ResumeStoreError>>({ code: "invalid_resume" }));

    await store.save({ name: "valid.pdf", mimeType: "application/pdf", bytes: pdf("valid") });
    const envelope = JSON.parse(await readFile(filePath, "utf8")) as { protectedPayload: string };
    envelope.protectedPayload = await testProtector.protectBytes(pdf("tampered"));
    await writeFile(filePath, JSON.stringify(envelope), "utf8");
    await expect(store.load()).rejects.toEqual(
      expect.objectContaining<Partial<ResumeStoreError>>({ code: "resume_storage_failed" })
    );
  });

  const windowsIt = process.platform === "win32" ? it : it.skip;
  windowsIt("roundtrips the persisted PDF with the production CurrentUser DPAPI provider", async () => {
    const directory = await mkdtemp(join(tmpdir(), "qiuzhao-resume-dpapi-"));
    const filePath = join(directory, "resume.json");
    const protector = new WindowsDpapiProtector({
      maxPlaintextBytes: 10 * 1024 * 1024,
      maxCiphertextBytes: 12 * 1024 * 1024,
      timeoutMs: 60_000
    });
    const saved = pdf("current-user-private-payload");
    await new FileResumeStore({ filePath, protector }).save({
      name: "current-user.pdf",
      mimeType: "application/pdf",
      bytes: saved
    });
    const disk = await readFile(filePath, "utf8");
    expect(disk).not.toContain("current-user.pdf");
    expect(disk).not.toContain("current-user-private-payload");
    const restored = await new FileResumeStore({ filePath, protector }).load();
    expect(Array.from(restored?.bytes ?? [])).toEqual(Array.from(saved));
    restored?.bytes.fill(0);
  }, 60_000);
});
