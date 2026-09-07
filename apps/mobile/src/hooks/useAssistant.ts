import { useAgentChat } from "@cloudflare/ai-chat/react";
import { AGENT_INSTANCE, AGENT_NAME } from "@tomo/shared";
import { useAgent } from "agents/react";
import type { Credentials } from "@/src/lib/auth";
import { readDeviceContext } from "@/src/lib/device";
import { readLocation } from "@/src/lib/location";

export function useAssistant(credentials: Credentials) {
  const agent = useAgent({
    agent: AGENT_NAME,
    name: AGENT_INSTANCE,
    host: credentials.host,
    query: async () => ({ token: credentials.token }),
    queryDeps: [credentials.token],
    cacheTtl: 0,
  });

  const chat = useAgentChat({
    agent,
    headers: { Authorization: `Bearer ${credentials.token}` },
    onToolCall: async ({ toolCall, addToolOutput }) => {
      if (toolCall.toolName === "getDeviceContext") {
        const output = await readDeviceContext();
        const handle = agent as {
          call?: (method: string, args: unknown[]) => Promise<unknown>;
          stub?: { updatePrefs?: (patch: { timezone: string }) => Promise<unknown> };
        };
        if (handle.call) {
          void handle.call("updatePrefs", [{ timezone: output.timezone }]);
        } else {
          void handle.stub?.updatePrefs?.({ timezone: output.timezone });
        }
        addToolOutput({
          toolCallId: toolCall.toolCallId,
          output,
        });
        return;
      }
      if (toolCall.toolName === "getLocation") {
        addToolOutput({
          toolCallId: toolCall.toolCallId,
          output: await readLocation(),
        });
      }
    },
  });

  return { agent, chat };
}
