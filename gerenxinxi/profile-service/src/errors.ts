export type ProfileServiceErrorCode =
  | "not_initialized"
  | "conflict"
  | "repository_busy"
  | "cleanup_incomplete"
  | "corrupt_storage"
  | "protection_failed"
  | "invalid_export"
  | "import_confirmation_required"
  | "invalid_import_confirmation"
  | "expired_import_confirmation"
  | "rollback_confirmation_required"
  | "invalid_rollback_confirmation"
  | "expired_rollback_confirmation"
  | "stale_profile_version"
  | "unknown_profile_path"
  | "non_scalar_profile_path";

export class ProfileServiceError extends Error {
  constructor(public readonly code: ProfileServiceErrorCode, message: string) {
    super(message);
    this.name = "ProfileServiceError";
  }
}
