import { z } from "zod";
import { CHAT_MODEL } from "./models";

export const deviceSchema = z.object({
  expoPushToken: z.string().min(1),
  platform: z.literal("ios"),
  registeredAt: z.number().int().nonnegative(),
});

export const prefsSchema = z.object({
  name: z.string().min(1).max(80).optional(),
  timezone: z.string().min(1),
  model: z.string().min(1),
});

export const prefsPatchSchema = z
  .object({
    name: z.string().min(1).max(80).optional(),
    timezone: z.string().min(1).optional(),
    model: z.string().min(1).optional(),
  })
  .refine((value) => Object.keys(value).length > 0, { message: "empty patch" });

export const reminderSchema = z.object({
  id: z.string().min(1),
  text: z.string().min(1),
  dueAt: z.number().int(),
  scheduleId: z.string().min(1),
});

export const reminderDeliverySchema = z.object({
  id: z.string().min(1),
  text: z.string().min(1),
  attempt: z.number().int().nonnegative(),
});

export const agentStateSchema = z.object({
  devices: z.array(deviceSchema),
  prefs: prefsSchema,
  reminders: z.array(reminderSchema),
  lastPushError: z.string().optional(),
  lastSummarizedCount: z.number().int().nonnegative().optional(),
});

export type Device = z.infer<typeof deviceSchema>;
export type Prefs = z.infer<typeof prefsSchema>;
export type PrefsPatch = z.infer<typeof prefsPatchSchema>;
export type Reminder = z.infer<typeof reminderSchema>;
export type ReminderDelivery = z.infer<typeof reminderDeliverySchema>;
export type AgentState = z.infer<typeof agentStateSchema>;

export function initialAgentState(chatModel: string = CHAT_MODEL): AgentState {
  return {
    devices: [],
    prefs: { timezone: "UTC", model: chatModel },
    reminders: [],
    lastSummarizedCount: 0,
  };
}
