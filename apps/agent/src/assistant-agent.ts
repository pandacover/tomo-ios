import { AIChatAgent, type OnChatMessageOptions } from "@cloudflare/ai-chat";
import {
  type AgentState,
  CONTEXT_WINDOW,
  type Device,
  initialAgentState,
  isAllowedChatModel,
  MAX_PERSISTED_MESSAGES,
  type PrefsPatch,
  prefsPatchSchema,
  recentWindow,
} from "@tomo/shared";
import type { StreamTextOnFinishCallback, ToolSet } from "ai";
import { convertToModelMessages, generateText, pruneMessages, stepCountIs, streamText } from "ai";
import { markCallable } from "./callable";
import { chatModel, utilityModel, webSearchTool } from "./llm";
import { memoryTools, wrapWithMemory } from "./memory";
import { buildSystemPrompt } from "./prompt";
import { sendExpoPush } from "./push";
import { clientTools } from "./tools/client";
import { reminderTools } from "./tools/reminders";

type ChatMessage = AIChatAgent["messages"][number];

export class AssistantAgent extends AIChatAgent<Env, AgentState> {
  initialState: AgentState = initialAgentState();
  maxPersistedMessages = MAX_PERSISTED_MESSAGES;

  override async onStart() {
    if (!this.state.prefs.model) {
      this.setState(initialAgentState(this.env.CHAT_MODEL));
    }
  }

  async onChatMessage(
    onFinish: StreamTextOnFinishCallback<ToolSet>,
    options?: OnChatMessageOptions,
  ) {
    if (!this.env.OPENROUTER_API_KEY) {
      return new Response("OPENROUTER_API_KEY is not configured", { status: 500 });
    }

    const { window, trimmed } = recentWindow(this.messages, CONTEXT_WINDOW);
    const model = wrapWithMemory(
      chatModel(this.env, this.state.prefs.model) as never,
      this.env,
      this.name,
    );

    const result = streamText({
      model,
      system: buildSystemPrompt(this.state),
      messages: pruneMessages({
        messages: await convertToModelMessages(window),
        toolCalls: "before-last-2-messages",
        reasoning: "before-last-message",
      }),
      tools: {
        ...memoryTools(this.env, this.name),
        ...reminderTools(this),
        ...clientTools(),
        web_search: webSearchTool(this.env),
      } as ToolSet,
      stopWhen: stepCountIs(5),
      abortSignal: options?.abortSignal,
      onFinish,
    });

    if (trimmed.length > 0) {
      this.ctx.waitUntil(this.summarizeTrimmed(trimmed));
    }

    return result.toUIMessageStreamResponse();
  }

  async registerDevice(expoPushToken: string) {
    const token = expoPushToken.trim();
    if (!token) throw new Error("expoPushToken is required");
    const next: Device = {
      expoPushToken: token,
      platform: "ios",
      registeredAt: Date.now(),
    };
    const devices = [...this.state.devices.filter((d) => d.expoPushToken !== token), next];
    this.setState({ ...this.state, devices, lastPushError: undefined });
    return { ok: true as const, count: devices.length };
  }

  async updatePrefs(patch: PrefsPatch) {
    const parsed = prefsPatchSchema.parse(patch);
    if (parsed.model && !isAllowedChatModel(parsed.model, this.env.CHAT_MODEL)) {
      throw new Error(`model is not allowed: ${parsed.model}`);
    }
    this.setState({
      ...this.state,
      prefs: {
        ...this.state.prefs,
        ...parsed,
      },
    });
    return this.state.prefs;
  }

  async sendReminder(payload: { id: string; text: string }) {
    const result = await sendExpoPush(
      this.state.devices,
      { title: "Reminder", body: payload.text, data: { id: payload.id } },
      this.env.EXPO_ACCESS_TOKEN,
    );
    this.setState({
      ...this.state,
      reminders: this.state.reminders.filter((r) => r.id !== payload.id),
      lastPushError: result.ok ? undefined : result.error,
    });
    return result;
  }

  private async summarizeTrimmed(trimmed: ChatMessage[]) {
    if (!this.env.OPENROUTER_API_KEY || !this.env.SUPERMEMORY_API_KEY) return;
    const text = trimmed
      .map((message) => {
        const body = message.parts
          .filter((part): part is { type: "text"; text: string } => part.type === "text")
          .map((part) => part.text)
          .join(" ")
          .trim();
        return body ? `${message.role}: ${body}` : "";
      })
      .filter(Boolean)
      .join("\n");
    if (!text) return;

    try {
      const { text: summary } = await generateText({
        model: utilityModel(this.env) as never,
        prompt: `Summarize durable facts about the user from these older conversation turns. Omit assistant chatter and one-off logistics.\n\n${text.slice(0, 12_000)}`,
      });
      if (!summary.trim()) return;
      const { default: Supermemory } = await import("supermemory");
      const client = new Supermemory({ apiKey: this.env.SUPERMEMORY_API_KEY });
      await client.add({
        content: summary,
        containerTag: this.name,
        customId: `${this.name}:window-summary`,
        metadata: { type: "window-summary" },
      });
    } catch (error) {
      console.error("summarizeTrimmed failed", error);
    }
  }
}

markCallable(AssistantAgent, ["registerDevice", "updatePrefs"]);
