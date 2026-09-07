/**
 * ISO week id (YYYY-Www) using the UTC calendar date of `date`.
 * Thursday determines the ISO week-year.
 */
export function isoWeekId(date: Date = new Date()): string {
  const utc = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = utc.getUTCDay() || 7;
  utc.setUTCDate(utc.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(utc.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((utc.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7);
  return `${utc.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

export function sessionCustomId(containerTag: string, date: Date = new Date()): string {
  return `${containerTag}:${isoWeekId(date)}`;
}

export type ParseDueAtResult = { ok: true; dueAtMs: number } | { ok: false; error: string };

/**
 * Parse an ISO-8601 datetime (must include an offset or Z) into epoch ms.
 * Wall-clock times without an offset are rejected so the Worker never
 * silently interprets them in UTC.
 */
export function parseDueAt(dueAt: string, nowMs: number): ParseDueAtResult {
  const trimmed = dueAt.trim();
  if (!/(?:Z|[+-]\d{2}:\d{2})$/.test(trimmed)) {
    return {
      ok: false,
      error: "dueAt must include a timezone offset (call getDeviceContext first)",
    };
  }
  const dueAtMs = Date.parse(trimmed);
  if (Number.isNaN(dueAtMs)) {
    return { ok: false, error: "dueAt is not a valid ISO 8601 datetime" };
  }
  if (dueAtMs <= nowMs) {
    return { ok: false, error: "dueAt must be in the future" };
  }
  return { ok: true, dueAtMs };
}

export function dueAtFromDelaySeconds(delaySeconds: number, nowMs: number): number {
  return nowMs + delaySeconds * 1000;
}
