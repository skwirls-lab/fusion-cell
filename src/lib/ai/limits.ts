/** Budget constants shared by the agent (server) and the panel (client); no server imports here. */
export const DEFAULT_MAX_STEPS = 8;
export const RESULT_CHAR_CAP = 12_000;
/**
 * Serverless wall-clock: routes that run the agent declare maxDuration = AGENT_MAX_DURATION_S and
 * give the tool turns AGENT_BUDGET_MS of it; the remainder is reserved for the forced final answer
 * (the longest single turn measured with the real model was ~70s).
 */
export const AGENT_MAX_DURATION_S = 300;
export const AGENT_BUDGET_MS = 200_000;
export const BRIEF_AGENT_BUDGET_MS = 150_000;
