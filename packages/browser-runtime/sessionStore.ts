import { chmod, mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import type { RuntimeSessionRecord } from "./types.js";

export async function readSession(file: string): Promise<RuntimeSessionRecord> {
  const value = JSON.parse(await readFile(file, "utf8")) as RuntimeSessionRecord;
  if (value.schemaVersion !== 1 || !value.capability || !value.status?.launchId) {
    throw new Error("invalid_session_record");
  }
  return value;
}

export async function writeSession(file: string, record: RuntimeSessionRecord): Promise<void> {
  await mkdir(path.dirname(file), { recursive: true, mode: 0o700 });
  const temp = `${file}.${process.pid}.tmp`;
  await writeFile(temp, `${JSON.stringify(record, null, 2)}\n`, { mode: 0o600 });
  await chmod(temp, 0o600);
  await rename(temp, file);
  await chmod(file, 0o600);
}
