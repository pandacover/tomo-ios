import { Data, Effect } from "effect";
import Constants from "expo-constants";
import * as Device from "expo-device";
import * as Notifications from "expo-notifications";

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

export class NotPhysicalDevice extends Data.TaggedError("NotPhysicalDevice") {}
export class PushPermissionDenied extends Data.TaggedError("PushPermissionDenied") {}
export class MissingEasProjectId extends Data.TaggedError("MissingEasProjectId") {}
export class PushTokenFailed extends Data.TaggedError("PushTokenFailed")<{
  readonly cause: unknown;
}> {}

export type PushRegistrationError =
  | NotPhysicalDevice
  | PushPermissionDenied
  | MissingEasProjectId
  | PushTokenFailed;

export function isPushRegistrationError(error: unknown): error is PushRegistrationError {
  if (typeof error !== "object" || error === null || !("_tag" in error)) return false;
  const tag = (error as { _tag: string })._tag;
  return (
    tag === "NotPhysicalDevice" ||
    tag === "PushPermissionDenied" ||
    tag === "MissingEasProjectId" ||
    tag === "PushTokenFailed"
  );
}

export function describePushError(error: PushRegistrationError): string {
  switch (error._tag) {
    case "NotPhysicalDevice":
      return "Push needs a physical iPhone and a dev client.";
    case "PushPermissionDenied":
      return "Notification permission denied — reminders will not alert this phone.";
    case "MissingEasProjectId":
      return "Push is not configured (run eas init). Reminders will not notify this phone.";
    case "PushTokenFailed":
      return "Could not get a push token.";
  }
}

export const fetchExpoPushToken: Effect.Effect<string, PushRegistrationError> = Effect.gen(
  function* () {
    if (!Device.isDevice) {
      return yield* new NotPhysicalDevice();
    }

    const existing = yield* Effect.tryPromise({
      try: () => Notifications.getPermissionsAsync(),
      catch: (cause) => new PushTokenFailed({ cause }),
    });
    let status = existing.status;
    if (status !== "granted") {
      const requested = yield* Effect.tryPromise({
        try: () => Notifications.requestPermissionsAsync(),
        catch: (cause) => new PushTokenFailed({ cause }),
      });
      status = requested.status;
    }
    if (status !== "granted") {
      return yield* new PushPermissionDenied();
    }

    const projectId =
      Constants.easConfig?.projectId ?? Constants.expoConfig?.extra?.eas?.projectId ?? undefined;
    if (!projectId) {
      return yield* new MissingEasProjectId();
    }

    const token = yield* Effect.tryPromise({
      try: () => Notifications.getExpoPushTokenAsync({ projectId }),
      catch: (cause) => new PushTokenFailed({ cause }),
    });
    return token.data;
  },
);
