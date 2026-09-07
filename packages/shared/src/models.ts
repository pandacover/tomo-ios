export const AGENT_NAME = "AssistantAgent";
export const AGENT_INSTANCE = "owner";

export const CHAT_MODEL = "deepseek/deepseek-v4-flash-0731";
export const UTILITY_MODEL = "google/gemini-3.1-flash-lite:batch";

/** User-facing models the Settings picker and updatePrefs may select. */
export const CHAT_MODEL_ALLOWLIST = [CHAT_MODEL] as const;

export type ChatModelId = (typeof CHAT_MODEL_ALLOWLIST)[number];

export const CONTEXT_WINDOW = 40;
export const MAX_PERSISTED_MESSAGES = 300;
export const MAX_PUSH_ATTEMPTS = 5;
export const PUSH_RETRY_BASE_SECONDS = 15;
export const NO_DEVICE_RETRY_SECONDS = 60;
export const MAX_DEVICES = 8;

export function isAllowedChatModel(id: string, envChatModel: string = CHAT_MODEL): boolean {
  return id === envChatModel || (CHAT_MODEL_ALLOWLIST as readonly string[]).includes(id);
}

export function nextPushRetryDelaySeconds(
  attempt: number,
  reason: "no-devices" | "transient",
): number {
  if (reason === "no-devices") return NO_DEVICE_RETRY_SECONDS;
  return PUSH_RETRY_BASE_SECONDS * 2 ** Math.min(Math.max(attempt, 0), 6);
}
