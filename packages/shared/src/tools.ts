import { z } from "zod";

/** Strict-mode-safe stand-in for a no-argument tool (OpenRouter requires `required`). */
export const noArgToolInputSchema = z.object({
  _: z.literal(true).describe("Always true. This tool takes no other arguments."),
});

export const setReminderInputSchema = z.object({
  text: z.string().min(1).describe("What to remind the user about"),
  dueAt: z
    .string()
    .min(1)
    .describe(
      "ISO 8601 datetime with the user's timezone offset from getDeviceContext, e.g. 2026-09-07T12:00:00-07:00",
    ),
});

export const cancelReminderInputSchema = z.object({
  id: z.string().min(1).describe("Reminder id from listReminders"),
});

export const listRemindersInputSchema = noArgToolInputSchema;

export const getDeviceContextInputSchema = noArgToolInputSchema;

export const getDeviceContextOutputSchema = z.object({
  timezone: z.string(),
  localTime: z.string(),
  locale: z.string(),
  batteryLevel: z.number().nullable(),
  lowPowerMode: z.boolean().nullable(),
});

export const getLocationInputSchema = noArgToolInputSchema;

export const getLocationOutputSchema = z.object({
  latitude: z.number(),
  longitude: z.number(),
  accuracy: z.number().nullable(),
});

export type SetReminderInput = z.infer<typeof setReminderInputSchema>;
export type CancelReminderInput = z.infer<typeof cancelReminderInputSchema>;
export type DeviceContext = z.infer<typeof getDeviceContextOutputSchema>;
export type LocationFix = z.infer<typeof getLocationOutputSchema>;
