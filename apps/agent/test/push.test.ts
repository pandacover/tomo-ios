import { describe, expect, test } from "bun:test";
import { Effect } from "effect";
import {
  isRetryablePushFailure,
  NoDevices,
  pruneDevices,
  sendExpoPush,
} from "../src/push";

const device = {
  expoPushToken: "ExponentPushToken[aaa]",
  platform: "ios" as const,
  registeredAt: 1,
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("sendExpoPush", () => {
  test("fails closed when no devices are registered", async () => {
    const result = await Effect.runPromise(
      sendExpoPush([], { title: "Reminder", body: "stretch" }).pipe(Effect.either),
    );
    expect(result._tag).toBe("Left");
    if (result._tag === "Left") {
      expect(result.left).toBeInstanceOf(NoDevices);
      expect(isRetryablePushFailure(result.left)).toBe("no-devices");
    }
  });

  test("succeeds and reports DeviceNotRegistered tokens as stale", async () => {
    const other = { ...device, expoPushToken: "ExponentPushToken[bbb]" };
    const fetchImpl: typeof fetch = async () =>
      jsonResponse({
        data: [
          { status: "ok", id: "1" },
          { status: "error", message: "Not registered", details: { error: "DeviceNotRegistered" } },
        ],
      });
    const result = await Effect.runPromise(
      sendExpoPush([device, other], { title: "Reminder", body: "stretch" }, undefined, fetchImpl),
    );
    expect(result.staleTokens).toEqual(["ExponentPushToken[bbb]"]);
    expect(pruneDevices([device, other], result.staleTokens)).toEqual([device]);
  });

  test("retries HTTP 500 then succeeds", async () => {
    let calls = 0;
    const fetchImpl: typeof fetch = async () => {
      calls += 1;
      if (calls < 3) return jsonResponse({ error: "upstream" }, 500);
      return jsonResponse({ data: [{ status: "ok", id: "1" }] });
    };
    const result = await Effect.runPromise(
      sendExpoPush([device], { title: "Reminder", body: "stretch" }, undefined, fetchImpl),
    );
    expect(calls).toBe(3);
    expect(result.staleTokens).toEqual([]);
  });

  test("does not retry HTTP 400", async () => {
    let calls = 0;
    const fetchImpl: typeof fetch = async () => {
      calls += 1;
      return jsonResponse({ error: "bad request" }, 400);
    };
    const result = await Effect.runPromise(
      sendExpoPush([device], { title: "Reminder", body: "stretch" }, undefined, fetchImpl).pipe(
        Effect.either,
      ),
    );
    expect(calls).toBe(1);
    expect(result._tag).toBe("Left");
  });
});
