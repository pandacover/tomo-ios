import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { isAllowedChatModel } from "@tomo/shared";

export function openRouter(env: Env) {
  return createOpenRouter({
    apiKey: env.OPENROUTER_API_KEY,
    appName: "tomo",
    appUrl: "https://tomo-agent.workers.dev",
  });
}

export function chatModel(env: Env, modelId?: string) {
  const id = modelId && isAllowedChatModel(modelId, env.CHAT_MODEL) ? modelId : env.CHAT_MODEL;
  return openRouter(env).chat(id);
}

export function utilityModel(env: Env) {
  return openRouter(env).chat(env.UTILITY_MODEL);
}

export function webSearchTool(env: Env) {
  return openRouter(env).tools.webSearch();
}
