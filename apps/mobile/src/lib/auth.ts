import { parseWorkerHost } from "@tomo/shared";
import * as SecureStore from "expo-secure-store";

const HOST_KEY = "tomo.host";
const TOKEN_KEY = "tomo.token";

export type Credentials = {
  host: string;
  token: string;
};

export async function loadCredentials(): Promise<Credentials | null> {
  const [host, token] = await Promise.all([
    SecureStore.getItemAsync(HOST_KEY),
    SecureStore.getItemAsync(TOKEN_KEY),
  ]);
  if (!host || !token) return null;
  return { host, token };
}

export async function saveCredentials(input: {
  host: string;
  token: string;
}): Promise<Credentials> {
  const host = parseWorkerHost(input.host);
  const token = input.token.trim();
  if (!host) throw new Error("Worker host is required");
  if (!token) throw new Error("App token is required");
  await Promise.all([
    SecureStore.setItemAsync(HOST_KEY, host),
    SecureStore.setItemAsync(TOKEN_KEY, token),
  ]);
  return { host, token };
}

export async function clearCredentials(): Promise<void> {
  await Promise.all([
    SecureStore.deleteItemAsync(HOST_KEY),
    SecureStore.deleteItemAsync(TOKEN_KEY),
  ]);
}
