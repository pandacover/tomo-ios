# Handoff: review of `main` (b9715b7, 2026-09-07)

Read-only review. Nothing below has been implemented; each item carries a suggested fix and a
verification step so it can be picked up independently.

## How this was produced

- Read every tracked source file in `apps/agent`, `apps/mobile`, `packages/shared`, `.github`.
- Ran the project checks on a clean `bun install --frozen-lockfile` (Bun 1.4.2, matching CI):
  `bun run lint`, `bun run typecheck`, `bun run test`, `bun run --filter @tomo/agent dry-run`.
  All pass (34 tests, 1 live test skipped, 1 Biome deprecation notice).
- Verified the SDK assumptions the code relies on against the installed packages
  (`agents@0.22.0`, `@cloudflare/ai-chat@0.11.0`, `@openrouter/ai-sdk-provider@3.0.0`,
  `@supermemory/tools@2.3.0`, `ai@6.0.277`), and reproduced the P0 with a throwaway script
  resolving the same dependency graph as `apps/agent`.
- Not verified: anything requiring API keys or a device (live OpenRouter/Supermemory calls,
  DeepSeek support for the `openrouter:web_search` server tool, the Expo app on hardware).

## Summary

| ID | Sev | Area | Title |
|---|---|---|---|
| P0-1 | P0 | agent | Every model call throws `AI_UnsupportedModelVersionError` (OpenRouter provider v4 spec vs `ai@6`) |
| P1-1 | P1 | mobile | `useAgent` re-creates the auth query promise every render; `use()` re-suspends |
| P1-2 | P1 | agent | Window-summary bookkeeping is index-based but `maxPersistedMessages` makes the buffer roll |
| P1-3 | P1 | agent | `CHAT_MODEL` wrangler var is effectively ignored after first state init |
| P1-4 | P1 | agent | Reminder delivery can double-send and can leave reminders stuck forever |
| P1-5 | P1 | mobile | A throwing client tool (`getLocation`) leaves the turn hanging |
| P2-1 | P2 | agent | Expo push receipts are never checked |
| P2-2 | P2 | agent | Summarization runs as a fire-and-forget promise on a `:batch` model |
| P2-3 | P2 | mobile | Message list: no scroll-to-end, text parts re-keyed on every token |
| P2-4 | P2 | mobile | Composer blocks typing while streaming; multiline `onSubmitEditing` never fires on iOS |
| P2-5 | P2 | mobile | Settings writes are fire-and-forget and errors are invisible |
| P2-6 | P2 | agent | System prompt lacks "now" and prints reminder times in UTC |
| P2-7 | P2 | agent | `cancelReminder` relies on the model to "ask first"; approval UI is dead code |
| P2-8 | P2 | ci | Deploy workflow is not gated on the CI workflow |
| P2-9 | P2 | tests | No coverage of the Durable Object surface (reminders, push retry, registerDevice, onStart) |
| P2-10 | P2 | mobile | Connection errors are collapsed into "Check the host and token" |
| P3-1 | P3 | agent | Token compare is not constant-time; token travels in the query string |
| P3-2 | P3 | agent | `forceOwnerInstance` matches the first `agents` segment anywhere in the path |
| P3-3 | P3 | deps | Three `ai` majors in the lockfile; unpinned runtime deps; hand-written `env.d.ts` |
| P3-4 | P3 | agent | `prefs.timezone` is not validated as an IANA zone |
| P3-5 | P3 | agent | Dynamic `import("supermemory")` and a second Supermemory client |
| P3-6 | P3 | mobile | No notification-tap handler |
| P3-7 | P3 | tooling | Biome `linter.rules.recommended` is deprecated |
| P3-8 | P3 | docs | README and `docs/v0-plan.md` drift from the code |

Suggested order: P0-1 first (the Worker is non-functional without it), then P1-1 (the app cannot
reliably reach the chat screen without it), then the rest of P1 in any order.

---

## P0

### P0-1. Every model call throws `AI_UnsupportedModelVersionError`

**Where:** `apps/agent/package.json` (`@openrouter/ai-sdk-provider: 3.0.0`, `ai: ^6.0.197`),
`apps/agent/src/llm.ts`, `apps/agent/src/assistant-agent.ts` lines 63 and 200 (`as never`).

**What:** `@openrouter/ai-sdk-provider@3.0.0` peer-depends on `ai@^7` and its models declare
`specificationVersion = "v4"`. The Worker runs `ai@6`, whose `resolveLanguageModel` only accepts
`"v2"` or `"v3"` and throws `UnsupportedModelVersionError` otherwise. `withSupermemory` is a Proxy
that forwards `specificationVersion` from the wrapped model, so wrapping does not help. The `as never`
casts on `chatModel(...)` and `utilityModel(...)` are what let this through `tsc`.

**Evidence:** reproduced with the exact resolved dependency graph of `apps/agent`:

```
openrouter model specificationVersion: v4
wrapped specificationVersion: v4
raw -> generateText  => AI_UnsupportedModelVersionError | Unsupported model version v4 ...
wrapped -> streamText => AI_UnsupportedModelVersionError | Unsupported model version v4 ...
```

The error is thrown before any network call, so every `onChatMessage` fails and every
`summarizeTrimmed` fails. `bun run test` cannot catch this: the only OpenRouter test
(`openrouter-tools.live.test.ts`) uses raw `fetch`, not the provider, and is skipped without a key.

**Impact:** the deployed Worker cannot answer a single message.

**Fix (recommended, minimal):** pin `@openrouter/ai-sdk-provider` to `2.10.0` (last 2.x; peer
`ai ^6.0.0`). Verified in a scratch project with `ai@6.0.277` + `@supermemory/tools@2.3.0`: the model
reports `v3`, `tools.webSearch` still exists, and `streamText` reaches OpenRouter (401 from the fake
key, as expected).

**Fix (alternative, larger):** move `apps/agent` to `ai@^7`. `agents@0.22` and
`@cloudflare/ai-chat@0.11` accept `ai ^6 || ^7`, but `@supermemory/tools@2.3.0` bundles `ai@5` and
peers on `@ai-sdk/provider ^2 || ^3`, so its tools and middleware would need a live check against
v4 call options; the mobile app would want `@ai-sdk/react@4` for consistency. Only worth it if 3.x
features are needed.

**Follow-ups in the same change:**
- Remove both `as never` casts so the compiler flags this class of drift.
- Add an offline unit test that builds `wrapWithMemory(chatModel(env))` and calls `streamText` with a
  stubbed `fetch`, asserting the error is not `AI_UnsupportedModelVersionError`.
- Optionally fail CI on peer-dependency warnings from `bun install`.

**Verify:** `bun run dev:agent` with real keys, send one message from the app (or
`curl -N -H "Authorization: Bearer $APP_TOKEN" ...` against `/agents/assistant-agent/owner`).

---

## P1

### P1-1. `useAgent` re-creates the auth query promise every render

**Where:** `apps/mobile/src/hooks/useAssistant.ts` lines 9-16.

**What:** `query: async () => ({ token })` is an inline arrow (new identity each render) and
`cacheTtl: 0`. In `agents/react` the query promise is `useMemo`-ed on `[cacheKey, query, ...]`, and
`getCacheEntry` returns nothing when `Date.now() >= expiresAt`; with `cacheTtl: 0` the entry expires
the moment it is written. So every render produces a fresh pending promise, `use(queryPromise)`
suspends, resolves, re-renders, and suspends again. React 19 reports this as an uncached promise
in a hook. The app also has no `<Suspense>` boundary of its own (expo-router's is the fallback).

**Impact:** the chat screen may never settle or flickers on each render; reconnects and RPC
calls are delayed. `assistant.agent` identity may also churn, retriggering the registration effect
in `assistant-context.tsx`.

**Fix:** the token does not rotate at runtime, so pass a static object `query: { token }` and drop
`cacheTtl`. If an async query is kept, wrap it in `useCallback([credentials.token])`, keep
`queryDeps: [credentials.token]`, and use a non-zero `cacheTtl`.

**Verify:** dev client, chat screen renders once; React DevTools shows no repeated suspension;
`registerDevice` fires once per launch (check Worker logs).

### P1-2. Window-summary bookkeeping is index-based but the buffer rolls

**Where:** `apps/agent/src/assistant-agent.ts` lines 59-61, 87-89, 180-217;
`packages/shared/src/window.ts` (`unsummarizedTrimmed`); `packages/shared/src/models.ts`
(`CONTEXT_WINDOW = 40`, `MAX_PERSISTED_MESSAGES = 300`).

**What:** `lastSummarizedCount` stores an index into `this.messages`. `AIChatAgent` enforces
`maxPersistedMessages` by deleting the oldest SQLite rows after each persist
(`_enforceMaxPersistedMessages`), so once the thread reaches 300 messages `this.messages.length`
stays at 300, `trimmed.length` stays at 260, `lastSummarizedCount` becomes 260, and
`unsummarizedTrimmed` returns `[]` forever. After `clearHistory` the count is still 260, so the
next 260 messages that fall out of the window are never summarized either. Two overlapping turns
also compute the same delta and both write (partially deduped by the `customId` suffix).

**Impact:** the "continuity comes from memory, not context" design silently stops working after
~2 weeks of use, and after any history clear.

**Fix:** track identity, not position. Store `lastSummarizedMessageId` (or the `createdAt` of the
last summarized message) and compute the delta as the trimmed messages after that id. Reset it
when history is cleared (hook the clear path in `AIChatAgent`). Make the `customId` derive from the
first/last message ids rather than indices. Run the job via `this.schedule(0, "summarizeTrimmed",
payload)` (see P2-2) so a single alarm serializes overlapping turns.

**Test to add:** a pure test in `packages/shared` for the new delta helper covering: buffer
saturated at `MAX_PERSISTED_MESSAGES`, history cleared, and id no longer present.

### P1-3. `CHAT_MODEL` wrangler var is effectively ignored

**Where:** `packages/shared/src/state.ts` (`initialAgentState` bakes the `CHAT_MODEL` constant into
`prefs.model`), `apps/agent/src/assistant-agent.ts` `onStart` (only overrides when `prefs.model` is
missing), `apps/agent/src/llm.ts` `chatModel`, `apps/mobile/app/(app)/settings.tsx` (picker lists
only `CHAT_MODEL_ALLOWLIST`).

**What:** `initialState` always has a model, so the `!prefs?.model` branch in `onStart` never runs,
and `this.env.CHAT_MODEL` is never written into prefs. `chatModel()` then accepts the constant as
"allowed" and uses it. Changing `vars.CHAT_MODEL` in `wrangler.jsonc` therefore changes nothing
for an existing (or new) DO. The Settings picker cannot offer the env model either.

**Fix:** either (a) leave `prefs.model` undefined in `initialState` and resolve
`prefs.model ?? env.CHAT_MODEL` at call time, or (b) in `onStart` reconcile whenever
`prefs.model` is not in `allowlist ∪ {env.CHAT_MODEL}`, and expose `availableModels` in state so
the picker can show the env model. Add a test for `onStart` with a pre-existing state whose model
differs from `env.CHAT_MODEL`.

### P1-4. Reminder delivery can double-send and can leave reminders stuck

**Where:** `apps/agent/src/assistant-agent.ts` `registerDevice` (lines 107-110) and
`sendReminder` (lines 159-177); `packages/shared/src/models.ts` (`MAX_PUSH_ATTEMPTS = 5`).

**What:**
- `registerDevice` immediately calls `sendReminder` for every reminder with `dueAt <= now`, without
  cancelling the retry alarm that `sendReminder` may already have scheduled (`NoDevices` retries every
  60 s). Both paths then push, so the user gets two notifications.
- When `attempt + 1 >= MAX_PUSH_ATTEMPTS`, or the failure is not retryable, the reminder is left in
  `state.reminders` indefinitely. It keeps appearing under "Upcoming reminders" in the system prompt
  (with a past time) and in Settings, and there is no path to clear it except `cancelReminder`.

**Fix:** in `registerDevice`, for each due reminder cancel `reminder.scheduleId` and reschedule
`sendReminder` at `0` instead of invoking it directly. In `sendReminder`, on terminal failure remove
the reminder (or move it to a `failedReminders` list shown in Settings) while keeping
`lastPushError`. Guard the top of `sendReminder` with `stillQueued` before sending.

**Test to add:** unit tests for `sendReminder` with a fake `schedule`/`cancelSchedule` covering:
success prunes stale tokens; `NoDevices` schedules a retry once; terminal attempt removes the
reminder; `registerDevice` with a due reminder cancels the prior schedule.

### P1-5. A throwing client tool leaves the turn hanging

**Where:** `apps/mobile/src/hooks/useAssistant.ts` `onToolCall`, `apps/mobile/src/lib/location.ts`.

**What:** `readLocation` awaits `Location.getCurrentPositionAsync`, which rejects when location
services are off or the fix times out. Nothing catches it, so `addToolOutput` is never called, the
server never receives a tool result, and `isStreaming`/`isRecovering` stay true with the composer
disabled (P2-4 compounds this).

**Fix:** wrap each branch of `onToolCall` in `try/catch` and always call `addToolOutput` with an
`{ error }` payload (both tools already tolerate an error object). Consider a timeout on
`getCurrentPositionAsync`.

---

## P2

### P2-1. Expo push receipts are never checked

**Where:** `apps/agent/src/push.ts`.

Expo returns tickets synchronously but reports most delivery failures (including
`DeviceNotRegistered`) only in receipts fetched later from `/--/api/v2/push/getReceipts`. Ticket ids
are currently discarded. Store the ticket ids, `schedule(15 * 60, "checkPushReceipts", ids)`, and
prune devices on `DeviceNotRegistered` from receipts.

### P2-2. Summarization runs as a fire-and-forget promise on a `:batch` model

**Where:** `apps/agent/src/assistant-agent.ts` line 88 (`this.ctx.waitUntil(...)`).

`waitUntil` does not extend Durable Object lifetime, and `UTILITY_MODEL` is a `:batch` variant with
unbounded latency. If the DO is evicted while the request is pending the summary is lost and
`lastSummarizedCount` never advances. The plan (§10) already prescribes running utility calls from a
`schedule()` callback. Pass a serializable payload (message ids or the extracted text, not
`ChatMessage[]`) and let the scheduler retry.

### P2-3. Message list: no scroll-to-end, text parts re-keyed on every token

**Where:** `apps/mobile/src/components/MessageList.tsx`.

A plain `ScrollView` renders all 300 persisted messages with no `scrollToEnd`, so new replies stream
in off-screen. `partKey` for text parts uses the text content, so each streamed token changes the key
and remounts the `Text`. Use `FlatList` (or `inverted`), key text parts by index, and call
`scrollToEnd` when `messages`/`isStreaming` change.

### P2-4. Composer blocks typing while streaming; multiline submit never fires on iOS

**Where:** `apps/mobile/src/components/Composer.tsx`.

`editable={!busy}` prevents composing the next message during a reply (the server default
`messageConcurrency = "queue"` supports queueing). On iOS a `multiline` `TextInput` inserts a
newline on return, so `onSubmitEditing` is unreachable; use `submitBehavior="submit"` or rely on
the button only.

### P2-5. Settings writes are fire-and-forget and errors are invisible

**Where:** `apps/mobile/app/(app)/settings.tsx`.

`void stub.stub?.updatePrefs?.(...)` swallows Zod and allow-list errors from the server. Await the
call, surface failures inline, and reflect the saved value from `agent.state`. Also unify on one RPC
path (`agent.call` vs `agent.stub`); `assistant-context.tsx` prefers `call`, Settings uses `stub`.

### P2-6. System prompt lacks "now" and prints reminder times in UTC

**Where:** `apps/agent/src/prompt.ts`.

The model has no current date/time, so relative reminders depend entirely on the `getDeviceContext`
round trip. Reminder times are `toISOString()` (UTC) while the prompt states the user's timezone,
inviting mis-rendered times. Include the current time formatted in `prefs.timezone` and format
reminders the same way.

### P2-7. `cancelReminder` relies on the model to "ask first"

**Where:** `apps/agent/src/tools/reminders.ts`, `apps/mobile/src/components/MessageList.tsx`.

The prompt says "Ask before cancelling reminders", but enforcement is up to the model. The app
already renders `approval-requested` parts and wires `addToolApprovalResponse`, yet no tool sets
`needsApproval`, so that UI is unreachable. Set `needsApproval: true` on `cancelReminder` to make the
guarantee real and exercise the approval path.

### P2-8. Deploy workflow is not gated on CI

**Where:** `.github/workflows/deploy.yml`, `.github/workflows/ci.yml`.

Both trigger on `push` to `main` and run in parallel; deploy only runs `dry-run`, so a commit that
fails lint/typecheck/tests still deploys. Either trigger deploy via `workflow_run` on `ci` success,
or fold it into `ci.yml` as a job with `needs: check` and the `main` condition.

### P2-9. No coverage of the Durable Object surface

**Where:** `apps/agent/test/`.

Tests cover `authorize`, `forceOwnerInstance`, `buildSystemPrompt`, `sendExpoPush`, `markCallable`.
Nothing exercises `reminderTools` (already designed around a fake `ReminderHost`), `sendReminder`
retry/prune, `registerDevice`, `onStart` migration, or `summarizeTrimmed`. The plan (§4) promised
`@cloudflare/vitest-pool-workers`; none is configured. Add unit tests with fakes first (cheap), then
one pool-workers integration test that boots `AssistantAgent` and round-trips a `@callable`.

### P2-10. Connection errors are collapsed into one message

**Where:** `apps/mobile/app/(app)/index.tsx`.

`chat.status === "error"` shows "Check the host and token" for every failure, including the
Worker's own `500 OPENROUTER_API_KEY is not configured` and P0-1's model error. Use `useAgent`'s
`onConnectionError`/`connectionError` to distinguish 401 from server errors and show the server
message when available.

---

## P3

### P3-1. Token compare and transport

`apps/agent/src/auth.ts` compares with `!==`; use `crypto.subtle.timingSafeEqual` on equal-length
buffers. The token is sent as `?token=` for the WebSocket and appears in request URLs captured by
`observability.enabled`. RN's WebSocket accepts custom headers; `agents/react` exposes the
PartySocket options, so the header path is viable for both HTTP and WS.

### P3-2. `forceOwnerInstance` path matching

`segments.indexOf("agents")` matches the first `agents` segment anywhere (`/x/agents/...`). Anchor
on `segments[1] === "agents"` to mirror `routeAgentRequest`'s prefix.

### P3-3. Dependency hygiene

`bun.lock` contains `ai@5`, `ai@6`, and `ai@7` (via `@supermemory/tools`, the app, and the
OpenRouter provider respectively), which is how P0-1 slipped through. `ai`, `effect`, `wrangler`,
and `supermemory` are caret-ranged although the plan says to pin. `apps/agent/src/env.d.ts` is
hand-written but `package.json` has a `types` script that would overwrite it with `wrangler types`;
pick one. Consider failing CI on `bun install` peer warnings.

### P3-4. `prefs.timezone` is not validated

`prefsPatchSchema` accepts any non-empty string. Validate with `Intl.supportedValuesOf("timeZone")`
or a `try { new Intl.DateTimeFormat(undefined, { timeZone }) }` refinement so P2-6 formatting cannot
throw.

### P3-5. Dynamic `import("supermemory")`

`summarizeTrimmed` does `await import("supermemory")` inside a bundled Worker (no code-splitting
benefit) and constructs a second client alongside the one inside `withSupermemory`. Import at the
top and build one client per request.

### P3-6. No notification-tap handler

Push payload carries `data.id` but the app never registers
`Notifications.addNotificationResponseReceivedListener`; tapping a reminder just opens the app.

### P3-7. Biome deprecation

`biome check` reports `linter.rules.recommended` is deprecated (remove in next major). Run
`bunx biome migrate --write`.

### P3-8. Documentation drift

- README: `bunx eas init` "writes extra.eas.projectId" is not true for a dynamic `app.config.ts`;
  the config reads `process.env.EAS_PROJECT_ID`, which must be set via `eas.json` `env` or the
  shell. Without it the app shows `MissingEasProjectId`.
- `docs/v0-plan.md` §4 lists `tools/memory.ts`, `tools/web.ts`, `(chat)/index.tsx` and a
  vitest/pool-workers test setup that do not exist; §5.1/§5.2 sketches differ from the code
  (`forceOwnerInstance`, `markCallable`, no `getDeviceContext`-driven prompt). Either mark the plan
  as historical or refresh §4-§5.

---

## Things that looked suspicious but check out

- `markCallable` reproduces what `@callable()` does (`callableMetadata.set(target, metadata)`),
  and `apps/agent` and `@cloudflare/ai-chat` resolve the same `agents@0.22.0` instance, so the
  WeakMap is shared. The built Worker contains one copy of `agents` and one of `ai`.
- `useAgentChat` `headers`, `isRecovering`, `isStreaming`, `clearHistory`,
  `addToolApprovalResponse`, and `getToolApproval` all exist in `agents@0.22.0`.
- `AgentClient.ready`, `.call`, `.stub`, `.reconnect`, `.readyState` exist as used.
- `pruneMessages` options `toolCalls: "before-last-2-messages"` and
  `reasoning: "before-last-message"` are valid in `ai@6`.
- `web_search` maps to OpenRouter's server-executed `openrouter:web_search` tool (still present in
  provider 2.10.0).
- `Effect.retry({ while, times, schedule })` behaves as the push tests assert.
