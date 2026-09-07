import { describe, expect, test } from "bun:test";
import { isoWeekId, parseDueAt, sessionCustomId } from "./time";

describe("isoWeekId", () => {
  test("returns ISO week of a Thursday in week 1", () => {
    expect(isoWeekId(new Date("2026-01-01T12:00:00Z"))).toBe("2026-W01");
  });

  test("assigns 2026-12-31 (Thursday) to 2026-W53", () => {
    expect(isoWeekId(new Date("2026-12-31T00:00:00Z"))).toBe("2026-W53");
  });

  test("assigns early January to the previous ISO week-year when needed", () => {
    expect(isoWeekId(new Date("2027-01-01T00:00:00Z"))).toBe("2026-W53");
  });
});

describe("sessionCustomId", () => {
  test("prefixes the container tag", () => {
    expect(sessionCustomId("owner", new Date("2026-09-07T00:00:00Z"))).toBe("owner:2026-W37");
  });
});

describe("parseDueAt", () => {
  const now = Date.parse("2026-09-07T17:00:00Z");

  test("accepts an offset datetime in the future", () => {
    const result = parseDueAt("2026-09-07T12:05:00-07:00", now);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.dueAtMs).toBe(Date.parse("2026-09-07T19:05:00Z"));
  });

  test("rejects a datetime without an offset", () => {
    const result = parseDueAt("2026-09-07T12:05:00", now);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("timezone offset");
  });

  test("rejects past datetimes", () => {
    const result = parseDueAt("2026-09-07T16:59:00Z", now);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("future");
  });

  test("rejects garbage", () => {
    const result = parseDueAt("tomorrow Z", now);
    expect(result.ok).toBe(false);
  });
});
