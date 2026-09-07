import { describe, expect, test } from "bun:test";
import { z } from "zod";
import { CHAT_MODEL, isAllowedChatModel, nextPushRetryDelaySeconds } from "./models";
import { agentStateSchema, initialAgentState, prefsPatchSchema } from "./state";
import {
  getDeviceContextOutputSchema,
  noArgToolInputSchema,
  setReminderInputSchema,
} from "./tools";
import { parseWorkerHost, recentWindow, unsummarizedTrimmed } from "./window";

describe("agentStateSchema", () => {
  test("round-trips the initial state", () => {
    const state = initialAgentState();
    expect(state.prefs.model).toBe(CHAT_MODEL);
    expect(agentStateSchema.parse(state)).toEqual(state);
  });

  test("rejects a prefs patch with no keys", () => {
    expect(prefsPatchSchema.safeParse({}).success).toBe(false);
  });
});

describe("tool schemas", () => {
  test("setReminder requires text and dueAt", () => {
    expect(setReminderInputSchema.safeParse({ text: "stretch" }).success).toBe(false);
    expect(
      setReminderInputSchema.safeParse({
        text: "stretch",
        dueAt: "2026-09-07T12:02:00-07:00",
      }).success,
    ).toBe(true);
  });

  test("no-arg tools emit a required dummy field for OpenRouter strict mode", () => {
    const json = z.toJSONSchema(noArgToolInputSchema);
    expect(json).toMatchObject({
      type: "object",
      required: ["_"],
    });
    expect(noArgToolInputSchema.safeParse({}).success).toBe(false);
    expect(noArgToolInputSchema.safeParse({ _: true }).success).toBe(true);
  });

  test("device context allows null battery fields", () => {
    expect(
      getDeviceContextOutputSchema.parse({
        timezone: "America/Los_Angeles",
        localTime: "2026-09-07T10:00:00-07:00",
        locale: "en-US",
        batteryLevel: null,
        lowPowerMode: null,
      }).timezone,
    ).toBe("America/Los_Angeles");
  });
});

describe("isAllowedChatModel", () => {
  test("accepts the default and an env override", () => {
    expect(isAllowedChatModel(CHAT_MODEL)).toBe(true);
    expect(isAllowedChatModel("openrouter/auto", "openrouter/auto")).toBe(true);
    expect(isAllowedChatModel("openrouter/auto")).toBe(false);
  });
});

describe("parseWorkerHost", () => {
  test("strips protocol and path", () => {
    expect(parseWorkerHost("https://tomo-agent.example.workers.dev/agents/x")).toBe(
      "tomo-agent.example.workers.dev",
    );
    expect(parseWorkerHost("tomo-agent.example.workers.dev")).toBe(
      "tomo-agent.example.workers.dev",
    );
  });
});

describe("recentWindow", () => {
  test("keeps the tail and reports trimmed prefix", () => {
    const messages = [1, 2, 3, 4, 5];
    expect(recentWindow(messages, 3)).toEqual({ window: [3, 4, 5], trimmed: [1, 2] });
    expect(recentWindow(messages, 40)).toEqual({ window: messages, trimmed: [] });
  });
});

describe("unsummarizedTrimmed", () => {
  test("skips messages already covered by lastSummarizedCount", () => {
    expect(unsummarizedTrimmed([1, 2, 3, 4], 2)).toEqual([3, 4]);
    expect(unsummarizedTrimmed([1, 2], 2)).toEqual([]);
    expect(unsummarizedTrimmed([1, 2], 0)).toEqual([1, 2]);
  });
});

describe("nextPushRetryDelaySeconds", () => {
  test("uses a long delay when no devices are registered", () => {
    expect(nextPushRetryDelaySeconds(0, "no-devices")).toBe(60);
  });

  test("exponentially backs off transient push failures", () => {
    expect(nextPushRetryDelaySeconds(0, "transient")).toBe(15);
    expect(nextPushRetryDelaySeconds(2, "transient")).toBe(60);
  });
});
