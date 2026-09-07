import { describe, expect, test } from "bun:test";
import { AGENT_INSTANCE, initialAgentState } from "@tomo/shared";
import { buildSystemPrompt } from "../src/prompt";
import { forceOwnerInstance } from "../src/routing";

describe("forceOwnerInstance", () => {
  test("rewrites a client-chosen instance to owner", () => {
    const rewritten = forceOwnerInstance(
      new Request("https://tomo-agent.workers.dev/agents/assistant-agent/someone?token=x"),
    );
    const url = new URL(rewritten.url);
    expect(url.pathname).toBe(`/agents/assistant-agent/${AGENT_INSTANCE}`);
    expect(url.searchParams.get("token")).toBe("x");
  });

  test("keeps trailing get-messages when rewriting the instance", () => {
    const rewritten = forceOwnerInstance(
      new Request(
        "https://tomo-agent.workers.dev/agents/assistant-agent/other/get-messages?token=x",
      ),
    );
    const url = new URL(rewritten.url);
    expect(url.pathname).toBe(`/agents/assistant-agent/${AGENT_INSTANCE}/get-messages`);
    expect(url.searchParams.get("token")).toBe("x");
  });

  test("leaves non-agent paths alone", () => {
    const original = new Request("https://tomo-agent.workers.dev/health");
    expect(forceOwnerInstance(original).url).toBe(original.url);
  });
});

describe("buildSystemPrompt", () => {
  test("includes timezone and reminder ids", () => {
    const state = initialAgentState();
    state.prefs.name = "Ada";
    state.prefs.timezone = "America/Los_Angeles";
    state.reminders = [
      { id: "r1", text: "stretch", dueAt: Date.parse("2026-09-07T19:00:00Z"), scheduleId: "s1" },
    ];
    const prompt = buildSystemPrompt(state);
    expect(prompt).toContain("Ada");
    expect(prompt).toContain("America/Los_Angeles");
    expect(prompt).toContain("[r1]");
    expect(prompt.length).toBeLessThan(2000);
  });
});
