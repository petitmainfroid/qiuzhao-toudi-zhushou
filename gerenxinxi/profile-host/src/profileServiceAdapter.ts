import {
  FileProfileRepository,
  ProfileServiceError,
  type ProfileVersion
} from "../../profile-service/src";
import {
  ProfileHostConflictError,
  type ProfileHostSnapshot,
  type ProfileHostStore
} from "./contracts";

function requireProfileVersion(revision: string): ProfileVersion {
  if (!/^pv_[a-f0-9]{64}$/.test(revision)) {
    throw new ProfileHostConflictError();
  }
  return revision as ProfileVersion;
}

function mapSnapshot(snapshot: Awaited<ReturnType<FileProfileRepository["load"]>>): ProfileHostSnapshot {
  return { profile: snapshot.profile, revision: snapshot.profileVersion };
}

export class FileProfileHostStore implements ProfileHostStore {
  constructor(private readonly repository: FileProfileRepository) {}

  async initialize(): Promise<ProfileHostSnapshot> {
    return mapSnapshot(await this.repository.initialize());
  }

  async load(): Promise<ProfileHostSnapshot> {
    return mapSnapshot(await this.repository.load());
  }

  async save(input: Parameters<ProfileHostStore["save"]>[0]): Promise<ProfileHostSnapshot> {
    try {
      return mapSnapshot(await this.repository.save({
        profile: input.profile,
        expectedProfileVersion: requireProfileVersion(input.expectedRevision)
      }));
    } catch (error) {
      throw mapProfileServiceError(error);
    }
  }

  async clear(input: Parameters<ProfileHostStore["clear"]>[0]): Promise<ProfileHostSnapshot> {
    try {
      return mapSnapshot(await this.repository.clear({
        expectedProfileVersion: requireProfileVersion(input.expectedRevision)
      }));
    } catch (error) {
      throw mapProfileServiceError(error);
    }
  }
}

function mapProfileServiceError(error: unknown): unknown {
  if (error instanceof ProfileServiceError && error.code === "conflict") {
    return new ProfileHostConflictError();
  }
  return error;
}
