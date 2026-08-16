import {
  ProfileImportCoordinator,
  createExplicitProfileExport,
  type ProfileImportCoordinatorOptions,
  type FileProfileRepository
} from "../../profile-service/src";
import type {
  ProfileHostImportCoordinator,
  ProfileHostImportPreview,
  ProfileHostSnapshot
} from "./contracts";

function snapshot(value: Awaited<ReturnType<FileProfileRepository["load"]>>): ProfileHostSnapshot {
  return { profile: value.profile, revision: value.profileVersion };
}

export class ProfileServiceImportAdapter implements ProfileHostImportCoordinator {
  private readonly coordinator: ProfileImportCoordinator;

  constructor(
    private readonly repository: FileProfileRepository,
    options: ProfileImportCoordinatorOptions = {}
  ) {
    this.coordinator = new ProfileImportCoordinator(repository, options);
  }

  async exportData(): Promise<{ serialized: string; suggestedFileName: string }> {
    const current = await this.repository.load();
    return {
      serialized: createExplicitProfileExport(current),
      suggestedFileName: `qiuzhao-profile-${new Date().toISOString().slice(0, 10)}.json`
    };
  }

  async previewImport(serialized: string): Promise<ProfileHostImportPreview> {
    const {
      sourceDigest: _sourceDigest,
      summaryDigest: _summaryDigest,
      sourceProfileVersion: _sourceProfileVersion,
      ...publicPreview
    } =
      await this.coordinator.preview(serialized);
    return Object.freeze(publicPreview);
  }

  async confirmImport(input: {
    confirmationToken: string;
    expectedCurrentProfileVersion: string;
    serialized: string;
  }) {
    const result = await this.coordinator.confirm({
      confirmationToken: input.confirmationToken,
      expectedCurrentProfileVersion: input.expectedCurrentProfileVersion as `pv_${string}`,
      serializedExport: input.serialized
    });
    return {
      snapshot: snapshot(result.snapshot),
      rollback: {
        rollbackToken: result.rollback.rollbackToken,
        expiresAt: result.rollback.expiresAt,
        expectedImportedProfileVersion: result.rollback.importedProfileVersion
      }
    };
  }

  async rollbackImport(input: { rollbackToken: string; expectedImportedProfileVersion: string }) {
    const result = await this.coordinator.rollbackImport({
      rollbackToken: input.rollbackToken,
      expectedImportedProfileVersion: input.expectedImportedProfileVersion as `pv_${string}`
    });
    return { snapshot: snapshot(result.snapshot) };
  }
}
