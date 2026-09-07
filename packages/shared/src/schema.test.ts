import { describe, expect, test } from "bun:test";
import { CHAT_MODEL, isAllowedChatModel } from "./models";
import { agentStateSchema, initialAgentState, prefsPatchSchema } from "./state";
import { getDeviceContextOutputSchema, setReminderInputSchema } from "./tools";
import { parseWorkerHost, recentWindow } from "./window";

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
