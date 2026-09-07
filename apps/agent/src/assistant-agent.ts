import { AIChatAgent, type OnChatMessageOptions } from "@cloudflare/ai-chat";
import {
  type AgentState,
  CONTEXT_WINDOW,
  type Device,
  initialAgentState,
  isAllowedChatModel,
  MAX_DEVICES,
  MAX_PERSISTED_MESSAGES,
  MAX_PUSH_ATTEMPTS,
  nextPushRetryDelaySeconds,
  type PrefsPatch,
  prefsPatchSchema,
  type ReminderDelivery,
  recentWindow,
  unsummarizedTrimmed,
} from "@tomo/shared";
import type { StreamTextOnFinishCallback, ToolSet } from "ai";
import { convertToModelMessages, generateText, pruneMessages, stepCountIs, streamText } from "ai";
import { Effect } from "effect";
import { markCallable } from "./callable";
import { chatModel, utilityModel, webSearchTool } from "./llm";
import { memoryTools, wrapWithMemory } from "./memory";
import { buildSystemPrompt } from "./prompt";
import { isRetryablePushFailure, pruneDevices, sendExpoPush } from "./push";
import { clientTools } from "./tools/client";
import { reminderTools } from "./tools/reminders";

type ChatMessage = AIChatAgent["messages"][number];

export class AssistantAgent extends AIChatAgent<Env, AgentState> {
  initialState: AgentState = initialAgentState();
  maxPersistedMessages = MAX_PERSISTED_MESSAGES;

  override async onStart() {
    const prefs = this.state.prefs;
    if (!prefs?.model) {
      this.setState({
        ...this.state,
        devices: this.state.devices ?? [],
        reminders: this.state.reminders ?? [],
        prefs: {
          timezone: prefs?.timezone ?? "UTC",
          ...(prefs?.name ? { name: prefs.name } : {}),
          model: this.env.CHAT_MODEL,
        },
      });
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
    const alreadySummarized = this.state.lastSummarizedCount ?? 0;
    const delta = unsummarizedTrimmed(trimmed, alreadySummarized);
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

    if (delta.length > 0) {
      this.ctx.waitUntil(this.summarizeTrimmed(delta, alreadySummarized, trimmed.length));
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
    const devices = [...this.state.devices.filter((d) => d.expoPushToken !== token), next].slice(
      -MAX_DEVICES,
    );
    this.setState({ ...this.state, devices, lastPushError: undefined });

    const due = this.state.reminders.filter((reminder) => reminder.dueAt <= Date.now());
    for (const reminder of due) {
      this.ctx.waitUntil(this.sendReminder({ id: reminder.id, text: reminder.text, attempt: 0 }));
    }
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

  async sendReminder(payload: ReminderDelivery) {
    const attempt = payload.attempt ?? 0;
    const result = await Effect.runPromise(
      sendExpoPush(
        this.state.devices,
        { title: "Reminder", body: payload.text, data: { id: payload.id } },
        this.env.EXPO_ACCESS_TOKEN,
      ).pipe(Effect.either),
    );

    if (result._tag === "Right") {
      const devices = pruneDevices(this.state.devices, result.right.staleTokens);
      this.setState({
        ...this.state,
        devices,
        reminders: this.state.reminders.filter((r) => r.id !== payload.id),
        lastPushError: undefined,
      });
      return { ok: true as const };
    }

    const error = result.left;
    const stale = "staleTokens" in error ? error.staleTokens : [];
    const devices = pruneDevices(this.state.devices, stale);
    this.setState({
      ...this.state,
      devices,
      lastPushError: error.message,
    });

    const kind = isRetryablePushFailure(error);
    const stillQueued = this.state.reminders.some((reminder) => reminder.id === payload.id);
    if (kind && stillQueued && attempt + 1 < MAX_PUSH_ATTEMPTS) {
      const delay = nextPushRetryDelaySeconds(attempt, kind);
      const scheduled = await this.schedule(delay, "sendReminder", {
        id: payload.id,
        text: payload.text,
        attempt: attempt + 1,
      });
      const scheduleId = typeof scheduled === "string" ? scheduled : scheduled.id;
      this.setState({
        ...this.state,
        reminders: this.state.reminders.map((reminder) =>
          reminder.id === payload.id ? { ...reminder, scheduleId } : reminder,
        ),
        lastPushError: error.message,
      });
    }
    return { ok: false as const, error: error.message };
  }

  private async summarizeTrimmed(delta: ChatMessage[], start: number, end: number) {
    if (!this.env.OPENROUTER_API_KEY || !this.env.SUPERMEMORY_API_KEY) return;
    const text = delta
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
    if (!text) {
      this.setState({ ...this.state, lastSummarizedCount: end });
      return;
    }

    try {
      const { text: summary } = await generateText({
        model: utilityModel(this.env) as never,
        prompt: `Summarize durable facts about the user from these older conversation turns. Omit assistant chatter and one-off logistics.\n\n${text.slice(0, 12_000)}`,
      });
      if (summary.trim()) {
        const { default: Supermemory } = await import("supermemory");
        const client = new Supermemory({ apiKey: this.env.SUPERMEMORY_API_KEY });
        await client.add({
          content: summary,
          containerTag: this.name,
          customId: `${this.name}:window:${start}-${end}`,
          metadata: { type: "window-summary" },
        });
      }
      this.setState({ ...this.state, lastSummarizedCount: end });
    } catch (error) {
      console.error("summarizeTrimmed failed", error);
    }
  }
}

markCallable(AssistantAgent, ["registerDevice", "updatePrefs"]);
