export const AGENT_NAME = "AssistantAgent";
export const AGENT_INSTANCE = "owner";

export const CHAT_MODEL = "deepseek/deepseek-v4-flash-0731";
export const UTILITY_MODEL = "google/gemini-3.1-flash-lite:batch";

/** User-facing models the Settings picker and updatePrefs may select. */
export const CHAT_MODEL_ALLOWLIST = [CHAT_MODEL] as const;

export type ChatModelId = (typeof CHAT_MODEL_ALLOWLIST)[number];

export const CONTEXT_WINDOW = 40;
export const MAX_PERSISTED_MESSAGES = 300;

export function isAllowedChatModel(id: string, envChatModel: string = CHAT_MODEL): boolean {
  return id === envChatModel || (CHAT_MODEL_ALLOWLIST as readonly string[]).includes(id);
}
