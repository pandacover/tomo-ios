import type { Device } from "@tomo/shared";

const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";

export type PushPayload = {
  title: string;
  body: string;
  data?: Record<string, string>;
};

export type PushResult = {
  ok: boolean;
  error?: string;
};

export async function sendExpoPush(
  devices: Device[],
  payload: PushPayload,
  accessToken?: string,
): Promise<PushResult> {
  if (devices.length === 0) {
    return { ok: false, error: "no registered devices" };
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

  const response = await fetch(EXPO_PUSH_URL, {
    method: "POST",
    headers,
    body: JSON.stringify(messages),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    return { ok: false, error: `expo push ${response.status}: ${text.slice(0, 200)}` };
  }

  const body = (await response.json().catch(() => null)) as {
    data?: Array<{ status?: string; message?: string }>;
  } | null;
  const firstError = body?.data?.find((item) => item.status === "error");
  if (firstError) {
    return { ok: false, error: firstError.message ?? "expo push ticket error" };
  }
  return { ok: true };
}
