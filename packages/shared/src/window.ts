/** Strip a pasted Worker URL down to the host `useAgent({ host })` expects. */
export function parseWorkerHost(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) return "";
  try {
    const withProto = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
    return new URL(withProto).host;
  } catch {
    return trimmed.replace(/^https?:\/\//i, "").replace(/\/+$/, "");
  }
}

export function recentWindow<T>(
  messages: readonly T[],
  limit: number,
): { window: T[]; trimmed: T[] } {
  if (messages.length <= limit) {
    return { window: [...messages], trimmed: [] };
  }
  return {
    window: messages.slice(-limit),
    trimmed: messages.slice(0, -limit),
  };
}

/** Messages in `trimmed` that have not yet been summarized. */
export function unsummarizedTrimmed<T>(
  trimmed: readonly T[],
  lastSummarizedCount: number,
): T[] {
  return trimmed.slice(Math.max(0, lastSummarizedCount));
}
