import Ajv, { type ValidateFunction } from "ajv";
import { CONVERSATION_EXECUTION_SCHEMA, CONVERSATION_INTENT_SCHEMA, JOB_ACTION_LEASE_SCHEMA, JOB_EVENT_SCHEMA, JOB_IDENTITY_SCHEMA, JOB_RANKING_DECISION_SCHEMA, JOB_RANKING_REQUEST_SCHEMA, JOB_RECORD_SCHEMA } from "./schema";
export class JobContractValidationError extends Error { constructor(public readonly code: "job_contract_invalid", public readonly contract: string) { super(`Invalid ${contract} contract`); this.name = "JobContractValidationError"; } }
const ajv = new Ajv({ strict: false, allErrors: true });
const validators = Object.freeze({ identity: ajv.compile(JOB_IDENTITY_SCHEMA), record: ajv.compile(JOB_RECORD_SCHEMA), event: ajv.compile(JOB_EVENT_SCHEMA), rankingRequest: ajv.compile(JOB_RANKING_REQUEST_SCHEMA), rankingDecision: ajv.compile(JOB_RANKING_DECISION_SCHEMA), lease: ajv.compile(JOB_ACTION_LEASE_SCHEMA), conversationIntent: ajv.compile(CONVERSATION_INTENT_SCHEMA), conversationExecution: ajv.compile(CONVERSATION_EXECUTION_SCHEMA) });
function parse<T>(contract: keyof typeof validators, value: unknown): Readonly<T> { const validator: ValidateFunction = validators[contract]; if (!validator(value)) throw new JobContractValidationError("job_contract_invalid", contract); return Object.freeze(value as T); }
export const parseNormalizedJobIdentity = (value: unknown) => parse<import("./types").NormalizedJobIdentity>("identity", value);
export const parseJobRecord = (value: unknown) => parse<import("./types").JobRecord>("record", value);
export const parseJobEvent = (value: unknown) => parse<import("./types").JobEvent>("event", value);
export const parseJobRankingRequest = (value: unknown) => parse<import("./types").JobRankingRequest>("rankingRequest", value);
export const parseJobRankingDecision = (value: unknown) => parse<import("./types").JobRankingDecision>("rankingDecision", value);
export const parseJobActionLease = (value: unknown) => parse<import("./types").JobActionLease>("lease", value);
export const parseConversationIntent = (value: unknown) => parse<import("./types").ConversationIntent>("conversationIntent", value);
export const parseConversationExecutionRequest = (value: unknown) => parse<import("./types").ConversationExecutionRequest>("conversationExecution", value);
