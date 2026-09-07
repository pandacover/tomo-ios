import { describe, expect, test } from "bun:test";
import { sendExpoPush } from "../src/push";

describe("sendExpoPush", () => {
  test("fails closed when no devices are registered", async () => {
    const result = await sendExpoPush([], { title: "Reminder", body: "stretch" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("no registered devices");
  });
});
