import type { DeviceContext } from "@tomo/shared";
import * as Battery from "expo-battery";

export async function readDeviceContext(): Promise<DeviceContext> {
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const locale = Intl.DateTimeFormat().resolvedOptions().locale ?? "en-US";
  const localTime = formatLocalIso(new Date());

  let batteryLevel: number | null = null;
  let lowPowerMode: boolean | null = null;
  try {
    batteryLevel = await Battery.getBatteryLevelAsync();
    lowPowerMode = await Battery.isLowPowerModeEnabledAsync();
  } catch {
    batteryLevel = null;
    lowPowerMode = null;
  }

  return { timezone, localTime, locale, batteryLevel, lowPowerMode };
}

function formatLocalIso(date: Date): string {
  const offset = formatOffset(date);
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().replace("Z", offset);
}

function formatOffset(date: Date): string {
  const minutes = -date.getTimezoneOffset();
  const sign = minutes >= 0 ? "+" : "-";
  const abs = Math.abs(minutes);
  const hh = String(Math.floor(abs / 60)).padStart(2, "0");
  const mm = String(abs % 60).padStart(2, "0");
  return `${sign}${hh}:${mm}`;
}
