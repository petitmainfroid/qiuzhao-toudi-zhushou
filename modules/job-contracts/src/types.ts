export const JOB_SOURCES = ["boss"] as const;
export type JobSource = (typeof JOB_SOURCES)[number];

export const JOB_STATES = ["discovered", "prefiltered", "scored", "review_required", "approved", "greeting_planned", "message_sent", "reply_detected", "campus_application_ready", "completed", "blocked", "failed", "archived"] as const;
export type JobState = (typeof JOB_STATES)[number];
export const JOB_ACTIONS = ["read_job_page", "send_message"] as const;
export type JobAction = (typeof JOB_ACTIONS)[number];
export const TERMINAL_REASONS = ["profile_missing", "review_required", "login_required", "verification_required", "site_policy", "page_drift", "authorization_required", "authorization_expired", "stale_plan", "budget_exhausted", "browser_disconnected", "no_new_reply", "unsupported_control", "cancelled", "conflict", "external_action_unverified"] as const;
export type TerminalReason = (typeof TERMINAL_REASONS)[number];

export interface NormalizedJobIdentity { source: JobSource; origin: string; path: string; sourceJobRef: string; }
export interface JobRecord { schemaVersion: 1; jobId: string; identity: NormalizedJobIdentity; title: string; company: string; location: string; description: string; state: JobState; version: number; createdAt: string; updatedAt: string; }
export interface JobEvent { schemaVersion: 1; eventId: string; jobId: string; kind: "discovered" | "prefiltered" | "scored" | "review_required" | "message_planned" | "message_sent" | "reply_detected" | "blocked" | "cancelled"; at: string; requestId: string; terminalReason?: TerminalReason; }
export interface ProfileCatalogEntry { path: string; hasValue: boolean; safetyClass: "ordinary" | "sensitive"; }
export interface JobRankingRequest { schemaVersion: 1; job: Pick<JobRecord, "jobId" | "title" | "company" | "location" | "description">; profileCatalog: readonly ProfileCatalogEntry[]; }
export interface JobRankingDecision { schemaVersion: 1; jobId: string; outcome: "pass" | "reject" | "review"; reason: "relevant" | "not_relevant" | "insufficient_profile" | "ambiguous"; }
export interface JobActionLease { schemaVersion: 1; leaseId: string; jobIds: readonly string[]; origins: readonly string[]; actions: readonly JobAction[]; expiresAt: string; }
export interface ConversationIntent { schemaVersion: 1; jobId: string; kind: "generate_greeting" | "manual" | "review"; reason?: TerminalReason; }
export interface ConversationExecutionRequest { schemaVersion: 1; planId: string; requestId: string; }
