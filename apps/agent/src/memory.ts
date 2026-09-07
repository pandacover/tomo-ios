import { addMemoryTool, searchMemoriesTool, withSupermemory } from "@supermemory/tools/ai-sdk";
import { sessionCustomId } from "@tomo/shared";

export function wrapWithMemory(
  model: Parameters<typeof withSupermemory>[0],
  env: Env,
  containerTag: string,
) {
  if (!env.SUPERMEMORY_API_KEY) return model;
  return withSupermemory(model, {
    containerTag,
    customId: sessionCustomId(containerTag),
    mode: "full",
    addMemory: "always",
    apiKey: env.SUPERMEMORY_API_KEY,
  });
}

export function memoryTools(env: Env, containerTag: string) {
  if (!env.SUPERMEMORY_API_KEY) return {};
  const apiKey = env.SUPERMEMORY_API_KEY;
  return {
    searchMemories: searchMemoriesTool(apiKey, {
      containerTags: [containerTag],
      strict: true,
    }),
    addMemory: addMemoryTool(apiKey, {
      containerTags: [containerTag],
      strict: true,
    }),
  };
}
