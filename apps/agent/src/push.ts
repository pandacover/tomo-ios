import type { Device } from "@tomo/shared";
import { Data, Duration, Effect, Schedule } from "effect";

const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";

export type PushPayload = {
  title: string;
  body: string;
  data?: Record<string, string>;
};

export class NoDevices extends Data.TaggedError("NoDevices")<{
  readonly message: string;
  readonly staleTokens: string[];
}> {}

export class PushHttpError extends Data.TaggedError("PushHttpError")<{
  readonly message: string;
  readonly status: number;
}> {}

export class PushTicketError extends Data.TaggedError("PushTicketError")<{
  readonly message: string;
  readonly staleTokens: string[];
}> {}

export type PushFailure = NoDevices | PushHttpError | PushTicketError;

export type PushSuccess = {
  readonly staleTokens: string[];
};

type ExpoTicket = {
  status?: string;
  message?: string;
  details?: { error?: string };
};

export function sendExpoPush(
  devices: Device[],
  payload: PushPayload,
  accessToken?: string,
  fetchImpl: typeof fetch = fetch,
): Effect.Effect<PushSuccess, PushFailure> {
  return Effect.gen(function* () {
    if (devices.length === 0) {
      return yield* new NoDevices({ message: "no registered devices", staleTokens: [] });
    }

    const messages = devices.map((device) => ({
      to: device.expoPushToken,
      sound: "default" as const,
      title: payload.title,
      body: payload.body,
      data: payload.data ?? {},
    }));

    const headers: Record<string, string> = {
      "content-type": "application/json",
      accept: "application/json",
    };
    if (accessToken) headers.authorization = `Bearer ${accessToken}`;

    const response = yield* Effect.tryPromise({
      try: () =>
        fetchImpl(EXPO_PUSH_URL, {
          method: "POST",
          headers,
          body: JSON.stringify(messages),
        }),
      catch: (cause) =>
        new PushHttpError({
          message: cause instanceof Error ? cause.message : "expo push network error",
          status: 0,
        }),
    });

    if (!response.ok) {
      const text = yield* Effect.tryPromise({
        try: () => response.text(),
        catch: () =>
          new PushHttpError({ message: "expo push body unread", status: response.status }),
      }).pipe(Effect.orElseSucceed(() => ""));
      return yield* new PushHttpError({
        message: `expo push ${response.status}: ${text.slice(0, 200)}`,
        status: response.status,
      });
    }

    const body = yield* Effect.tryPromise({
      try: () => response.json() as Promise<{ data?: ExpoTicket[] }>,
      catch: () => new PushTicketError({ message: "expo push json unread", staleTokens: [] }),
    }).pipe(Effect.orElseSucceed(() => null as { data?: ExpoTicket[] } | null));

    const tickets = body?.data ?? [];
    const staleTokens: string[] = [];
    const otherErrors: string[] = [];
    let okCount = 0;

    if (tickets.length === 0) {
      return yield* new PushTicketError({
        message: "empty expo push response",
        staleTokens: [],
      });
    }

    tickets.forEach((ticket, index) => {
      if (ticket.status === "ok") {
        okCount += 1;
        return;
      }
      if (ticket.status === "error") {
        const token = devices[index]?.expoPushToken;
        if (ticket.details?.error === "DeviceNotRegistered" && token) {
          staleTokens.push(token);
          return;
        }
        otherErrors.push(ticket.message ?? "expo push ticket error");
      }
    });

    if (okCount > 0 && otherErrors.length === 0) {
      return { staleTokens };
    }
    if (okCount === 0 && staleTokens.length === devices.length) {
      return yield* new NoDevices({
        message: "all devices unregistered",
        staleTokens,
      });
    }
    if (otherErrors.length > 0 && okCount === 0) {
      return yield* new PushTicketError({
        message: otherErrors[0] ?? "expo push ticket error",
        staleTokens,
      });
    }
    return { staleTokens };
  }).pipe(
    Effect.retry({
      while: (error) =>
        error._tag === "PushHttpError" && (error.status === 0 || error.status >= 500),
      times: 3,
      schedule: Schedule.exponential(Duration.millis(200)),
    }),
  );
}

export function isRetryablePushFailure(error: PushFailure): "no-devices" | "transient" | false {
  if (error._tag === "NoDevices") return "no-devices";
  if (error._tag === "PushHttpError") return "transient";
  if (error._tag === "PushTicketError") return "transient";
  return false;
}

export function pruneDevices(devices: Device[], staleTokens: string[]): Device[] {
  if (staleTokens.length === 0) return devices;
  const stale = new Set(staleTokens);
  return devices.filter((device) => !stale.has(device.expoPushToken));
}
