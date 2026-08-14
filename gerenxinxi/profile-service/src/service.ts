import { createAgentProfileSnapshot, resolveCanonicalScalar } from "./catalog";
import { ProfileServiceError } from "./errors";
import type { FileProfileRepository } from "./repository";
import type { AgentProfileSnapshot, ResolveScalarRequest } from "./types";

export class ProfileService {
  constructor(private readonly repository: FileProfileRepository) {}

  async getAgentSnapshot(): Promise<Readonly<AgentProfileSnapshot>> {
    const snapshot = await this.repository.load();
    return createAgentProfileSnapshot(snapshot.profile, snapshot.profileVersion);
  }

  createResolver(): VersionBoundProfileResolver {
    return new VersionBoundProfileResolver(this.repository);
  }
}

export class VersionBoundProfileResolver {
  constructor(private readonly repository: FileProfileRepository) {}

  async resolveScalar(request: Readonly<ResolveScalarRequest>): Promise<string> {
    const current = await this.repository.load();
    if (request.profileVersion !== current.profileVersion) {
      throw new ProfileServiceError("stale_profile_version", "profile version changed after planning");
    }
    return resolveCanonicalScalar(current.profile, request.profilePath);
  }
}
