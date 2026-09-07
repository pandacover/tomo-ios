import { describe, expect, test } from "bun:test";
import { CHAT_MODEL, getDeviceContextInputSchema } from "@tomo/shared";
import { z } from "zod";

const apiKey = process.env.OPENROUTER_API_KEY;

describe("OpenRouter CHAT_MODEL tool schema", () => {
  test.skipIf(!apiKey)(
    "accepts the no-arg getDeviceContext schema under strict mode",
    async () => {
      const parameters = z.toJSONSchema(getDeviceContextInputSchema);
      const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
          authorization: `Bearer ${apiKey}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          model: CHAT_MODEL,
          messages: [{ role: "user", content: "Call getDeviceContext now." }],
          tools: [
            {
              type: "function",
              function: {
                name: "getDeviceContext",
                description: "Read the iPhone timezone and local time.",
                parameters,
                strict: true,
              },
            },
          ],
          tool_choice: { type: "function", function: { name: "getDeviceContext" } },
        }),
      });
      const body = (await response.json()) as { error?: { message?: string }; choices?: unknown[] };
      expect(response.ok, body.error?.message ?? `status ${response.status}`).toBe(true);
      expect(body.choices?.length).toBeGreaterThan(0);
    },
    45_000,
  );
});
