import { lstat, mkdir, readdir, realpath } from "node:fs/promises";
import { isAbsolute, join, relative, resolve } from "node:path";
import { FileProfileRepository, type AtRestProtector } from "../../profile-service/src";
import { loadProfileHostUiBundle } from "./assets";
import type { ProfileHostHandle } from "./contracts";
import { startProfileHost } from "./host";
import { FileProfileHostStore } from "./profileServiceAdapter";
import { ProfileServiceImportAdapter } from "./profileImportAdapter";

export interface LocalProfileEditorOptions {
  appDataDirectory: string;
  uiDirectory: string;
  /** Must be the profile-service production protector. The host never implements encryption. */
  protector: AtRestProtector;
  bootstrapTtlMs?: number;
  sessionTtlMs?: number;
}

export async function resolveLocalProfilePath(appDataDirectory: string): Promise<string> {
  if (!isAbsolute(appDataDirectory)) throw new Error("The application data directory must be absolute.");
  const requestedRoot = resolve(appDataDirectory);
  await mkdir(requestedRoot, { recursive: true });
  const rootEntry = await lstat(requestedRoot);
  if (!rootEntry.isDirectory() || rootEntry.isSymbolicLink()) {
    throw new Error("The application data directory must be a real directory.");
  }
  const trustedRoot = await realpath(requestedRoot);
  const profileDirectory = join(trustedRoot, "profile");
  await mkdir(profileDirectory, { recursive: true });
  const profileEntry = await lstat(profileDirectory);
  if (!profileEntry.isDirectory() || profileEntry.isSymbolicLink()) {
    throw new Error("The profile data directory must be a real directory.");
  }
  const trustedProfileDirectory = await realpath(profileDirectory);
  const descendant = relative(trustedRoot, trustedProfileDirectory);
  if (descendant.startsWith("..") || isAbsolute(descendant)) {
    throw new Error("The profile data directory escaped the application directory.");
  }
  for (const entry of await readdir(trustedProfileDirectory, { withFileTypes: true })) {
    if (entry.isSymbolicLink()) {
      throw new Error("The profile data directory contains an unsafe reparse entry.");
    }
  }
  return join(trustedProfileDirectory, "profile.json");
}

export async function startLocalProfileEditor(options: LocalProfileEditorOptions): Promise<ProfileHostHandle> {
  const repository = new FileProfileRepository({
    filePath: await resolveLocalProfilePath(options.appDataDirectory),
    protector: options.protector
  });
  const store = new FileProfileHostStore(repository);
  const localData = new ProfileServiceImportAdapter(repository);
  await store.initialize();
  return startProfileHost({
    store,
    localData,
    ui: await loadProfileHostUiBundle(options.uiDirectory),
    bootstrapTtlMs: options.bootstrapTtlMs,
    sessionTtlMs: options.sessionTtlMs
  });
}
