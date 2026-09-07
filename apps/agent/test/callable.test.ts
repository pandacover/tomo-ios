import { describe, expect, test } from "bun:test";
import { markCallable } from "../src/callable";

class Probe {
  ping() {
    return "ok";
  }
}

describe("markCallable", () => {
  test("keeps method identity so Agents RPC wrapping still finds it", () => {
    const original = Probe.prototype.ping;
    markCallable(Probe, ["ping"]);
    expect(Probe.prototype.ping).toBe(original);
    expect(new Probe().ping()).toBe("ok");
  });

  test("throws when the name is not a method", () => {
    expect(() => markCallable(Probe, ["missing" as never])).toThrow(/not a method/);
  });
});
