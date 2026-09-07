import type { PropsWithChildren } from "react";
import { createContext, createElement, useContext, useEffect, useMemo } from "react";
import { useAssistant } from "@/src/hooks/useAssistant";
import type { Credentials } from "@/src/lib/auth";
import { registerPushToken } from "@/src/lib/notifications";

type AssistantApi = ReturnType<typeof useAssistant>;

const AssistantContext = createContext<AssistantApi | null>(null);

export function AssistantProvider({
  credentials,
  children,
}: PropsWithChildren<{ credentials: Credentials }>) {
  const assistant = useAssistant(credentials);

  useEffect(() => {
    let cancelled = false;
    void registerPushToken().then((token) => {
      if (cancelled || !token) return;
      const agent = assistant.agent as {
        stub?: { registerDevice?: (value: string) => Promise<unknown> };
      };
      void agent.stub?.registerDevice?.(token);
    });
    return () => {
      cancelled = true;
    };
  }, [assistant.agent]);

  const value = useMemo(() => assistant, [assistant]);
  return createElement(AssistantContext.Provider, { value }, children);
}

export function useAssistantContext(): AssistantApi {
  const ctx = useContext(AssistantContext);
  if (!ctx) throw new Error("useAssistantContext must be used within AssistantProvider");
  return ctx;
}
