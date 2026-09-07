import {
  type AgentState,
  cancelReminderInputSchema,
  listRemindersInputSchema,
  parseDueAt,
  type Reminder,
  setReminderInputSchema,
} from "@tomo/shared";
import { tool } from "ai";

export type ReminderHost = {
  state: AgentState;
  setState: (state: AgentState) => void;
  schedule: (
    when: Date | string | number,
    callback: "sendReminder",
    payload: { id: string; text: string; attempt: number },
  ) => Promise<{ id: string } | string>;
  cancelSchedule: (id: string) => Promise<boolean> | boolean;
};

export function reminderTools(agent: ReminderHost) {
  return {
    setReminder: tool({
      description:
        "Set a reminder that will push to the user's iPhone. Always call getDeviceContext first and pass dueAt with that timezone offset.",
      inputSchema: setReminderInputSchema,
      execute: async ({ text, dueAt }) => {
        const parsed = parseDueAt(dueAt, Date.now());
        if (!parsed.ok) return { ok: false as const, error: parsed.error };
        const id = crypto.randomUUID();
        const scheduled = await agent.schedule(new Date(parsed.dueAtMs), "sendReminder", {
          id,
          text,
          attempt: 0,
        });
        const scheduleId = typeof scheduled === "string" ? scheduled : scheduled.id;
        const reminder: Reminder = { id, text, dueAt: parsed.dueAtMs, scheduleId };
        agent.setState({
          ...agent.state,
          reminders: [...agent.state.reminders, reminder],
        });
        return { ok: true as const, id, dueAt: new Date(parsed.dueAtMs).toISOString() };
      },
    }),

    listReminders: tool({
      description: "List upcoming reminders the assistant has scheduled.",
      inputSchema: listRemindersInputSchema,
      execute: async () => ({
        reminders: agent.state.reminders.map((r) => ({
          id: r.id,
          text: r.text,
          dueAt: new Date(r.dueAt).toISOString(),
        })),
      }),
    }),

    cancelReminder: tool({
      description: "Cancel a reminder by id from listReminders.",
      inputSchema: cancelReminderInputSchema,
      execute: async ({ id }) => {
        const existing = agent.state.reminders.find((r) => r.id === id);
        if (!existing) return { ok: false as const, error: "reminder not found" };
        await agent.cancelSchedule(existing.scheduleId);
        agent.setState({
          ...agent.state,
          reminders: agent.state.reminders.filter((r) => r.id !== id),
        });
        return { ok: true as const, id };
      },
    }),
  };
}
