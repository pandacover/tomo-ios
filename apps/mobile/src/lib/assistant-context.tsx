import { Duration, Effect, Fiber, Schedule } from "effect";
import type { PropsWithChildren } from "react";
import { createContext, createElement, useContext, useEffect, useMemo, useState } from "react";
import { AppState, type AppStateStatus } from "react-native";
import { useAssistant } from "@/src/hooks/useAssistant";
import type { Credentials } from "@/src/lib/auth";
import { readDeviceContext } from "@/src/lib/device";
import {
  describePushError,
  fetchExpoPushToken,
  isPushRegistrationError,
} from "@/src/lib/notifications";

type AssistantApi = ReturnType<typeof useAssistant> & {
  pushNotice: string | null;
};

const AssistantContext = createContext<AssistantApi | null>(null);

type AgentHandle = {
  ready: Promise<void>;
  readyState?: number;
  reconnect?: () => void;
  call?: (method: string, args: unknown[]) => Promise<unknown>;
  stub?: {
    registerDevice?: (token: string) => Promise<unknown>;
    updatePrefs?: (patch: { timezone: string }) => Promise<unknown>;
  };
};

function waitForOpen(agent: AgentHandle): Effect.Effect<AgentHandle, Error> {
  return Effect.tryPromise({
    try: async () => {
      await agent.ready;
      if (!agent.call && !agent.stub?.registerDevice) {
        throw new Error("registerDevice is not available yet");
      }
      return agent;
    },
    catch: (cause) => (cause instanceof Error ? cause : new Error("agent not ready")),
  });
}

function registerDevice(agent: AgentHandle, token: string): Effect.Effect<void, Error> {
  return Effect.tryPromise({
    try: async () => {
      if (agent.call) {
        await agent.call("registerDevice", [token]);
        return;
      }
      if (!agent.stub?.registerDevice) {
        throw new Error("registerDevice is not available yet");
      }
      await agent.stub.registerDevice(token);
    },
    catch: (cause) => (cause instanceof Error ? cause : new Error("registerDevice failed")),
  });
}

function syncTimezone(agent: AgentHandle): Effect.Effect<void, never> {
  return Effect.tryPromise({
    try: async () => {
      const context = await readDeviceContext();
      if (agent.call) {
        await agent.call("updatePrefs", [{ timezone: context.timezone }]);
        return;
      }
      await agent.stub?.updatePrefs?.({ timezone: context.timezone });
    },
    catch: () => new Error("updatePrefs failed"),
  }).pipe(Effect.catchAll(() => Effect.void));
}

const readyRetry = Schedule.spaced(Duration.millis(400)).pipe(Schedule.intersect(Schedule.recurs(20)));
const registerRetry = Schedule.spaced(Duration.millis(400)).pipe(
  Schedule.intersect(Schedule.recurs(10)),
);

export function AssistantProvider({
  credentials,
  children,
}: PropsWithChildren<{ credentials: Credentials }>) {
  const assistant = useAssistant(credentials);
  const [pushNotice, setPushNotice] = useState<string | null>(null);

  useEffect(() => {
    const agent = assistant.agent as AgentHandle;
    const fiber = Effect.runFork(
      Effect.gen(function* () {
        const token = yield* fetchExpoPushToken;
        const ready = yield* waitForOpen(agent).pipe(Effect.retry(readyRetry));
        yield* registerDevice(ready, token).pipe(Effect.retry(registerRetry));
        yield* syncTimezone(ready);
      }).pipe(
        Effect.tapError((error) =>
          Effect.sync(() => {
            setPushNotice(
              isPushRegistrationError(error)
                ? describePushError(error)
                : "Could not register this phone for reminders.",
            );
          }),
        ),
        Effect.tap(() => Effect.sync(() => setPushNotice(null))),
      ),
    );
    return () => {
      Effect.runFork(Fiber.interrupt(fiber));
    };
  }, [assistant.agent, credentials.token]);

  useEffect(() => {
    const agent = assistant.agent as AgentHandle;
    const onChange = (state: AppStateStatus) => {
      if (state !== "active") return;
      // CONNECTING=0. Reconnect on resume even when the socket still looks OPEN;
      // iOS often keeps a zombie WebSocket across suspension.
      if (agent.readyState === 0) return;
      agent.reconnect?.();
    };
    const sub = AppState.addEventListener("change", onChange);
    return () => sub.remove();
  }, [assistant.agent]);

  const value = useMemo<AssistantApi>(() => ({ ...assistant, pushNotice }), [assistant, pushNotice]);
  return createElement(AssistantContext.Provider, { value }, children);
}

export function useAssistantContext(): AssistantApi {
  const ctx = useContext(AssistantContext);
  if (!ctx) throw new Error("useAssistantContext must be used within AssistantProvider");
  return ctx;
}
