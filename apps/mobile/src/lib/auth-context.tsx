import type { PropsWithChildren } from "react";
import { createContext, createElement, useContext, useEffect, useMemo, useState } from "react";
import {
  type Credentials,
  clearCredentials,
  loadCredentials,
  saveCredentials,
} from "@/src/lib/auth";

type AuthValue = {
  credentials: Credentials | null;
  ready: boolean;
  save: (input: { host: string; token: string }) => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthValue | null>(null);

export function AuthProvider({ children }: PropsWithChildren) {
  const [credentials, setCredentials] = useState<Credentials | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    void loadCredentials()
      .then(setCredentials)
      .finally(() => setReady(true));
  }, []);

  const value = useMemo<AuthValue>(
    () => ({
      credentials,
      ready,
      save: async (input) => {
        const next = await saveCredentials(input);
        setCredentials(next);
      },
      signOut: async () => {
        await clearCredentials();
        setCredentials(null);
      },
    }),
    [credentials, ready],
  );

  return createElement(AuthContext.Provider, { value }, children);
}

export function useAuth(): AuthValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
