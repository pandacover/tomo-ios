import { getDeviceContextInputSchema, getLocationInputSchema } from "@tomo/shared";
import { tool } from "ai";

/** Client-side tools: no execute(). The iOS app fills these in via onToolCall. */
export function clientTools() {
  return {
    getDeviceContext: tool({
      description:
        "Read the iPhone timezone, local time, locale, and battery. Call this before setting reminders so dueAt uses the user's offset.",
      inputSchema: getDeviceContextInputSchema,
    }),
    getLocation: tool({
      description:
        "Read the iPhone's current coordinates after the user grants location permission. Only call when the request needs a place.",
      inputSchema: getLocationInputSchema,
    }),
  };
}
