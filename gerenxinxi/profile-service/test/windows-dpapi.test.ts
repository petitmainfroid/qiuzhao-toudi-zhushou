import { describe, expect, it, vi } from "vitest";
import { isAbsolute } from "node:path";
import { WindowsDpapiProtector, type DpapiProcessRequest } from "../src/index";

describe("Windows DPAPI process boundary", () => {
  it("keeps plaintext out of argv and sends it only as base64 over stdin", async () => {
    const secret = "private-profile-值";
    let captured: Readonly<DpapiProcessRequest> | undefined;
    const runner = vi.fn(async (request: Readonly<DpapiProcessRequest>) => {
      captured = request;
      return Buffer.from("ciphertext").toString("base64");
    });
    const provider = new WindowsDpapiProtector({ platform: "win32", processRunner: runner });
    const encrypted = await provider.protect(secret);
    expect(encrypted).toBe(Buffer.from("ciphertext").toString("base64"));
    expect(captured?.args.join(" ")).not.toContain(secret);
    expect(captured?.executable).not.toContain(secret);
    expect(isAbsolute(captured!.executable)).toBe(true);
    expect(captured?.stdin).not.toContain(secret);
    expect(JSON.parse(captured!.stdin)).toEqual({ op: "protect", data: Buffer.from(secret).toString("base64") });
    expect(captured?.args).toEqual(expect.arrayContaining(["-NoProfile", "-NonInteractive", "-EncodedCommand"]));
  });

  it("normalizes process errors and malformed/oversized output to a fixed typed error", async () => {
    const secret = "must-not-leak";
    for (const runner of [
      async () => { throw new Error(`stderr ${secret}`); },
      async () => "not base64!",
      async () => Buffer.alloc(1024).toString("base64")
    ]) {
      const provider = new WindowsDpapiProtector({
        platform: "win32",
        processRunner: runner,
        maxPlaintextBytes: 32,
        maxCiphertextBytes: 64
      });
      await expect(provider.protect(secret)).rejects.toEqual(expect.objectContaining({
        code: "protection_failed",
        message: "Windows user-bound profile protection failed"
      }));
    }
  });

  it("rejects non-Windows construction and oversized input before spawning", async () => {
    expect(() => new WindowsDpapiProtector({ platform: "linux" }))
      .toThrow(expect.objectContaining({ code: "protection_failed" }));
    const runner = vi.fn(async () => "");
    const provider = new WindowsDpapiProtector({ platform: "win32", processRunner: runner, maxPlaintextBytes: 8 });
    await expect(provider.protect("x".repeat(9))).rejects.toEqual(expect.objectContaining({ code: "protection_failed" }));
    expect(runner).not.toHaveBeenCalled();
  });
});

const windowsIt = process.platform === "win32" ? it : it.skip;

describe("Windows CurrentUser DPAPI integration", () => {
  windowsIt("roundtrips across separate PowerShell processes and rejects tampering", async () => {
    const first = new WindowsDpapiProtector();
    const plaintext = `cross-process-${crypto.randomUUID()}-私密`;
    const protectedPayload = await first.protect(plaintext);
    expect(protectedPayload).not.toContain(plaintext);

    const second = new WindowsDpapiProtector();
    await expect(second.unprotect(protectedPayload)).resolves.toBe(plaintext);

    const pdfBytes = new TextEncoder().encode("%PDF-1.7\nprivate-resume-bytes\n%%EOF");
    const protectedPdf = await first.protectBytes(pdfBytes);
    expect(protectedPdf).not.toContain("private-resume-bytes");
    expect(Array.from(await second.unprotectBytes(protectedPdf))).toEqual(Array.from(pdfBytes));

    const bytes = Buffer.from(protectedPayload, "base64");
    bytes[Math.floor(bytes.length / 2)] ^= 0xff;
    await expect(second.unprotect(bytes.toString("base64")))
      .rejects.toEqual(expect.objectContaining({ code: "protection_failed" }));
  }, 30_000);
});
