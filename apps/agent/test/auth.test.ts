import { describe, expect, test } from "bun:test";
import { authorize, readToken } from "../src/auth";

function request(url: string, headers?: HeadersInit) {
  return new Request(url, { headers });
}

const env = { APP_TOKEN: "secret" };

describe("authorize", () => {
  test("rejects when APP_TOKEN is empty", () => {
    const res = authorize(request("https://x/agents/a/b?token=secret"), { APP_TOKEN: "" });
    expect(res?.status).toBe(401);
  });

  test("accepts a matching query token", () => {
    expect(authorize(request("https://x/agents/a/b?token=secret"), env)).toBeUndefined();
  });

  test("accepts a Bearer header", () => {
    expect(
      authorize(request("https://x/agents/a/b", { authorization: "Bearer secret" }), env),
    ).toBeUndefined();
  });

  test("rejects the wrong token", () => {
    expect(authorize(request("https://x/agents/a/b?token=nope"), env)?.status).toBe(401);
  });
});

describe("readToken", () => {
  test("prefers the query param", () => {
    expect(
      readToken(request("https://x/?token=from-query", { authorization: "Bearer from-header" })),
    ).toBe("from-query");
  });
});
