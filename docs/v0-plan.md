# tomo v0 — personal AI assistant for iOS

Status: proposed plan. Nothing in this document is built yet.

## 1. What v0 is

A single-user, text-first assistant on iPhone that:

- holds one continuous conversation with you (no thread list in v0),
- streams replies and survives app backgrounding / network drops mid-reply,
- remembers facts about you across sessions (Supermemory) without being told to "remember",
- can set reminders that arrive as iOS push notifications,
- can look things up on the web,
- runs entirely on infrastructure you control: one Cloudflare Worker, one Expo app.

What v0 is not: multi-user, voice, multiple threads, integrations (calendar, email, Notion, …), on-device models, Android, web client. See §9 for the deferred list and why.

## 2. Stack and the role of each piece

| Layer | Choice | Role in v0 |
|---|---|---|
| Language / tooling | TypeScript, Bun workspaces, Biome | Monorepo, scripts, formatting/lint, tests for pure TS packages |
| Mobile | Expo (latest SDK, Expo Router, dev client, EAS) | iOS app; connects to the agent over WebSocket |
| Backend runtime | Cloudflare Workers + Durable Objects | One Worker hosts the agent; DO gives per-user persistent state |
| Agent framework | Cloudflare Agents SDK (`agents`, `@cloudflare/ai-chat`) | `AIChatAgent` for chat persistence, resumable streaming, tool calls, scheduling |
| LLM access | OpenRouter via `@openrouter/ai-sdk-provider` + Vercel AI SDK (`ai`) | Model routing, one key, per-model fallback, `web` plugin for search |
| Long-term memory | Supermemory (`@supermemory/tools/ai-sdk`, `supermemory`) | Profile injection, semantic recall, automatic conversation ingest |
| Push | Expo Push API (`exp.host`) called from the Worker | Reminder delivery |
| Secrets/config | Wrangler secrets, `expo-secure-store` on device | API keys never ship in the app |

Cloudflare pieces deliberately not used in v0: D1, KV, R2, Queues, Workflows, Workers AI. The agent's own SQLite (inside the Durable Object) is enough state for a single user, and Workflows/Queues add operational surface without a v0 use case.

## 3. Architecture

```
┌──────────────── iPhone (Expo) ────────────────┐
│ Expo Router app                               │
│  useAgent()  ──WebSocket──┐                   │
│  useAgentChat()           │  ?token=<secret>  │
│  onToolCall (client tools)│                   │
│  expo-notifications       │                   │
└───────────────────────────┼───────────────────┘
                            ▼
┌────────── Cloudflare Worker (wrangler) ───────┐
│ fetch → routeAgentRequest(onBeforeConnect)    │
│                                               │
│  AssistantAgent extends AIChatAgent  (1 DO)   │
│   • messages (SQLite, resumable stream)       │
│   • state: { devices, prefs, reminders }      │
│   • onChatMessage → streamText(openrouter)    │
│   • tools: memory, reminders, web             │
│   • schedule() → sendReminder → Expo Push     │
└──────────┬────────────────────┬───────────────┘
           ▼                    ▼
     OpenRouter API      Supermemory API
   (models + :online)  (profile / search / add)
```

Key decisions:

**One Durable Object per user, one thread.** The agent instance name is the user id (`owner` in v0). Chat history, scheduled reminders, device push tokens, and preferences all live in that one DO. This removes the need for a second "index" DO to track conversations, and matches the product shape (an assistant you talk to, not a chat app with folders). Multi-thread is a v1 concern and can be added by introducing a per-thread `ChatAgent` later without changing the client transport.

**Continuity comes from memory, not from context.** The LLM context is a sliding window of recent messages (start with the last ~40, tune by token count). Anything older is reachable only through Supermemory. This keeps cost flat over months of use and forces the memory layer to actually work.

**WebSocket for everything user-facing.** `useAgentChat` sends and streams over the agent's WebSocket, so the app never depends on streaming `fetch` in React Native. Resumable streaming is on by default: if iOS suspends the app mid-reply, the buffered chunks are replayed on reconnect.

**All model and vendor calls happen in the Worker.** The app holds exactly one secret (the app token). OpenRouter and Supermemory keys are Wrangler secrets.

## 4. Repository layout

```
tomo-ios/
├─ apps/
│  ├─ mobile/            Expo app (Expo Router)
│  │  ├─ app/            routes: (chat)/index.tsx, settings.tsx, setup.tsx
│  │  ├─ src/            components, hooks (useAssistant), lib (auth, notifications)
│  │  ├─ polyfills.ts
│  │  ├─ app.config.ts
│  │  └─ eas.json
│  └─ agent/             Cloudflare Worker
│     ├─ src/
│     │  ├─ index.ts             fetch handler, routeAgentRequest + auth
│     │  ├─ assistant-agent.ts   AssistantAgent extends AIChatAgent
│     │  ├─ llm.ts               OpenRouter provider + model config
│     │  ├─ memory.ts            Supermemory wiring
│     │  ├─ tools/               reminders.ts, memory.ts, web.ts, client.ts
│     │  ├─ push.ts              Expo Push client
│     │  └─ prompt.ts            system prompt assembly
│     ├─ test/                   vitest + @cloudflare/vitest-pool-workers
│     ├─ wrangler.jsonc
│     └─ tsconfig.json           extends agents' tsconfig (TC39 decorators)
├─ packages/
│  └─ shared/            zod schemas + types shared by app and agent
│                        (AgentState, ToolNames, client-tool payloads)
├─ docs/
├─ biome.json
├─ package.json          bun workspaces, root scripts
└─ bun.lock
```

Bun is the package manager and script runner (`bun install`, `bun run dev:agent`, `bun run dev:mobile`, `bun test` for `packages/shared`). Wrangler and Expo CLI each run under Bun via `bunx`. EAS Build detects `bun.lock` and uses Bun on the build servers. Worker tests run under Vitest with the Workers pool, not `bun test`, because they need `workerd` semantics (DO storage, `cloudflare:workers` imports).

## 5. Backend design (`apps/agent`)

### 5.1 Worker entry and auth

```ts
// src/index.ts
import { routeAgentRequest } from "agents";

export { AssistantAgent } from "./assistant-agent";

export default {
  async fetch(req: Request, env: Env) {
    const authorize = (r: Request) => {
      const token = new URL(r.url).searchParams.get("token")
        ?? r.headers.get("authorization")?.replace(/^Bearer /, "");
      if (token !== env.APP_TOKEN) return new Response("unauthorized", { status: 401 });
    };
    return (await routeAgentRequest(req, env, {
      onBeforeConnect: authorize,
      onBeforeRequest: authorize,
    })) ?? new Response("not found", { status: 404 });
  },
};
```

v0 auth is a single long random `APP_TOKEN` (Wrangler secret). The app passes it via the `query` option of `useAgent`. The agent instance name is hard-coded to `owner` server-side; the client cannot choose it. Upgrade path (v1): Sign in with Apple → Worker verifies the identity token → issues a short-lived JWT → `containerTag`/instance name derive from the stable Apple user id.

### 5.2 `AssistantAgent`

```ts
// src/assistant-agent.ts (sketch)
import { AIChatAgent } from "@cloudflare/ai-chat";
import { callable } from "agents";
import { streamText, convertToModelMessages, stepCountIs } from "ai";
import { withSupermemory } from "@supermemory/tools/ai-sdk";

type State = {
  devices: { expoPushToken: string; platform: "ios"; registeredAt: number }[];
  prefs: { name?: string; timezone: string; model: string };
  reminders: { id: string; text: string; dueAt: number; scheduleId: string }[];
};

export class AssistantAgent extends AIChatAgent<Env, State> {
  initialState: State = { devices: [], prefs: { timezone: "UTC", model: DEFAULT_MODEL }, reminders: [] };
  maxPersistedMessages = 500;

  async onChatMessage(onFinish) {
    const base = openrouter(this.env)(this.state.prefs.model);
    const model = withSupermemory(base, {
      containerTag: this.name,            // "owner"
      customId: sessionCustomId(this.name), // e.g. owner:2026-09-07
      mode: "full",                        // profile + query-scoped search injected
      addMemory: "always",                 // every turn appended to the session doc
      apiKey: this.env.SUPERMEMORY_API_KEY,
    });

    const result = streamText({
      model,
      system: buildSystemPrompt(this.state),
      messages: await convertToModelMessages(recentWindow(this.messages)),
      tools: buildTools(this),
      stopWhen: stepCountIs(5),
      onFinish,
    });
    return result.toUIMessageStreamResponse();
  }

  @callable()
  registerDevice(expoPushToken: string) { /* upsert into state.devices */ }

  @callable()
  updatePrefs(patch: Partial<State["prefs"]>) { /* validate + setState */ }

  // schedule() callback
  async sendReminder(payload: { id: string; text: string }) {
    await sendExpoPush(this.state.devices, { title: "Reminder", body: payload.text, data: payload });
    this.setState({ ...this.state, reminders: this.state.reminders.filter(r => r.id !== payload.id) });
  }
}
```

Notes:

- `this.name` is the DO instance name and doubles as the Supermemory `containerTag`.
- `customId` is rotated daily so a single Supermemory document does not grow without bound; Supermemory's graph links across documents under the same `containerTag`.
- `withSupermemory` caches the memory fetch per user turn, so tool-call loops within one turn do not re-query.
- `maxPersistedMessages` is storage, not context. `recentWindow()` decides what the model sees.

### 5.3 Tools

Server tools (executed in the DO):

| Tool | Impl | Why in v0 |
|---|---|---|
| `searchMemories` | `searchMemoriesTool(apiKey, { containerTags: [name], strict: true })` | Explicit recall for "what do you know about…" beyond the auto-injected profile |
| `addMemory` | `addMemoryTool(apiKey, { containerTags: [name], strict: true })` | Explicit "remember that…" as a distinct, durable fact |
| `setReminder` | zod tool → `this.schedule(dueAt, "sendReminder", { id, text })` + push into `state.reminders` | Core assistant value; showcases DO scheduling + push |
| `listReminders` / `cancelReminder` | read state / `this.cancelSchedule(id)` | Needed for the feature to be trustworthy |
| `webSearch` | Route the turn through OpenRouter's `web` plugin (or model `:online` suffix) when the model asks | Avoids a search vendor; one key |

`strict: true` on the Supermemory tools is required: OpenRouter forwards to OpenAI-compatible backends with strict schema validation, and without it optional fields (`limit`, `includeFullDocs`) fail validation.

Client tools (no `execute`; resolved in the app via `onToolCall`):

| Tool | Returns |
|---|---|
| `getDeviceContext` | timezone, local time, locale, battery/low-power (cheap, high-value for reminders) |
| `getLocation` | lat/lng after `expo-location` permission; only when the user's request implies it |

The Agents SDK auto-continues the turn after the client supplies tool output.

### 5.4 Reminders and push

- `setReminder` computes an absolute timestamp using the device timezone from `getDeviceContext` (never the Worker's clock zone), stores `{ id, text, dueAt, scheduleId }` in state, and calls `this.schedule(dueAt, "sendReminder", payload)`.
- `sendReminder` POSTs to `https://exp.host/--/api/v2/push/send` for every registered device. Expo's push service handles the APNs credential; EAS holds the APNs key.
- Failures are recorded into state (`lastPushError`) so the app can surface "notifications may not be arriving".
- The app registers its token on launch via `agent.stub.registerDevice(token)`; tokens are upserted so re-installs do not duplicate.

### 5.5 System prompt

Assembled per turn from: assistant persona + operating rules (concise, ask before destructive/irreversible actions, never invent memories), device context if known, current reminders summary, and the Supermemory profile block that `withSupermemory` injects. Keep the static part under ~400 tokens; the profile block is bounded by Supermemory.

### 5.6 `wrangler.jsonc`

```jsonc
{
  "name": "tomo-agent",
  "main": "src/index.ts",
  "compatibility_date": "2026-09-01",
  "compatibility_flags": ["nodejs_compat"],
  "durable_objects": { "bindings": [{ "name": "AssistantAgent", "class_name": "AssistantAgent" }] },
  "migrations": [{ "tag": "v1", "new_sqlite_classes": ["AssistantAgent"] }],
  "observability": { "enabled": true },
  "vars": { "DEFAULT_MODEL": "anthropic/claude-sonnet-4.5" }
}
```

Secrets (`wrangler secret put`): `APP_TOKEN`, `OPENROUTER_API_KEY`, `SUPERMEMORY_API_KEY`, optional `EXPO_ACCESS_TOKEN`.

Model selection is config, not code. Start with one strong default for chat and, if needed, a cheaper model for any non-user-facing generation (none planned in v0). OpenRouter's `models` fallback array covers provider outages.

## 6. Mobile design (`apps/mobile`)

### 6.1 Screens

- **Setup** (first launch): paste the app token + Worker URL (or read from a QR); stored in `expo-secure-store`. Requests notification permission, registers the push token.
- **Chat** (home): message list rendered from `messages[].parts` — text, tool parts (compact "Set reminder for 9:00" chips, approval UI if a tool requires it), and a "recovering…" hint when `isRecovering` is true. Composer with send/stop.
- **Settings**: display name, model picker (from a static list), reminders list (read from agent state), clear history, sign out (wipe secure store).

### 6.2 Data flow

```ts
const agent = useAgent<AssistantAgent, State>({
  agent: "AssistantAgent",
  host: WORKER_HOST,
  query: async () => ({ token: await getToken() }),   // re-evaluated on reconnect
  onStateUpdate: setAgentState,
});

const chat = useAgentChat({
  agent,
  onToolCall: async ({ toolCall, addToolOutput }) => {
    if (toolCall.toolName === "getDeviceContext") addToolOutput({ toolCallId: toolCall.toolCallId, output: deviceContext() });
    if (toolCall.toolName === "getLocation")      addToolOutput({ toolCallId: toolCall.toolCallId, output: await location() });
  },
});
```

`agent.state` is the single source of truth for reminders/prefs; the app never caches them separately.

### 6.3 React Native specifics to verify in the spike (M0)

- `agents/react` and `@cloudflare/ai-chat/react` resolve under Metro (package `exports`; enabled by default in current Expo SDKs). Neither client entry should pull in `cloudflare:workers`.
- Polyfills likely needed (from the AI SDK Expo guide): `structuredClone`, `TextEncoderStream`/`TextDecoderStream`. Load in `polyfills.ts`, imported first in `app/_layout.tsx`.
- WebSocket reconnect behaviour when iOS suspends the app: confirm `useAgent` reconnects and `useAgentChat` replays the buffered stream. If reconnection is sluggish, force a reconnect on `AppState` → `active`.
- `getInitialMessages` (HTTP fetch of history on mount) must include the token; use `prepareSendMessagesRequest`/`headers` or rely on the `query` param being appended.
- Push tokens require a dev client / EAS build. Expo Go is not sufficient for notifications on iOS.

### 6.4 Build and distribution

- `expo-dev-client` for day-to-day; EAS Build `development` profile on device.
- `preview` profile → internal TestFlight for real-world use (backgrounding, push, cellular).
- Bundle identifier, APNs key, and Apple team configured once in EAS.

## 7. Shared package (`packages/shared`)

- zod schemas for `AgentState`, tool inputs/outputs (`setReminder`, `getDeviceContext`, `getLocation`), and the settings patch.
- Type exports only; no runtime dependency on Cloudflare or React Native.
- `bun test` covers schema round-trips and the reminder time-resolution helper (timezone math is the most bug-prone pure logic in v0).

## 8. Milestones and acceptance criteria

Ordered by risk, not by feature value. Each milestone ends deployed and runnable on a physical iPhone.

**M0 — Connectivity spike.** Bare Worker with a `Counter`-style agent and an Expo dev-client app that connects via `useAgent`, calls a `@callable`, receives `onStateUpdate`. Then swap in `AIChatAgent` + `useAgentChat` with a hard-coded OpenRouter model and stream one reply.
Exit: streamed reply on device; app backgrounded for 30 s mid-reply, foregrounded, reply completes. Metro/polyfill issues are resolved or have a documented workaround.

**M1 — Skeleton and deploy.** Monorepo layout, Biome, shared package, `APP_TOKEN` auth in `onBeforeConnect`/`onBeforeRequest`, setup screen with secure store, Worker deployed to `*.workers.dev` (custom domain optional), GitHub Actions: typecheck + lint + `wrangler deploy` on `main`.
Exit: fresh install → paste token → chat works against production Worker; wrong token is rejected.

**M2 — Memory.** `withSupermemory` in `full` mode, daily `customId` rotation, `searchMemories`/`addMemory` tools with `strict: true`, sliding-window context, system prompt assembly.
Exit: tell the assistant three facts, clear chat history, reinstall the app; it recalls the facts in a new conversation unprompted where relevant and on explicit ask.

**M3 — Reminders and push.** Device registration, `setReminder`/`listReminders`/`cancelReminder`, `schedule()` → Expo Push, `getDeviceContext` client tool for timezone, settings screen showing reminders from state.
Exit: "remind me in 2 minutes to stretch" produces a notification on a locked phone at the right time in the device's timezone; cancelling removes it.

**M4 — Web and polish.** `webSearch` via OpenRouter web plugin with source rendering, tool-part chips, error and offline states, "recovering…" indicator, model picker, TestFlight build.
Exit: one week of daily personal use with no reinstall, no lost messages, and cost visible in OpenRouter/Supermemory dashboards.

## 9. Deferred, and why

| Item | Reason to defer |
|---|---|
| Voice (STT/TTS) | Needs `expo-speech-recognition` or Workers AI Whisper plus audio UX; orthogonal to the agent core. Slot for v0.5 once text is trustworthy. |
| Multiple threads | Requires a per-user index DO and thread routing; the single-thread model is a deliberate product simplification. |
| Multi-user / Sign in with Apple | Adds identity, per-user secrets, and billing concerns. The `containerTag`/instance-name design already makes this a swap, not a rewrite. |
| Integrations (calendar, mail, Notion, GitHub) | Each is an OAuth flow plus a tool surface. The Agents SDK MCP client is the intended path (`addMcpServer`), evaluated after v0. |
| Attachments / images | Needs R2 and vision-capable model plumbing. |
| Proactive check-ins (`scheduleEvery`) | Easy to add mechanically; hard to make non-annoying. Do it once memory quality is proven. |
| Workflows / Queues | No multi-minute background jobs in v0. |
| Android / web | Expo makes it cheap later; not the target user. |

## 10. Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| Cloudflare client hooks misbehave under Metro/Hermes (exports resolution, missing globals) | Medium | M0 spike first. Fallback: use `AgentClient` from `agents/client` directly with a thin hook, or `@ai-sdk/react` `useChat` over `expo/fetch` against the agent's HTTP endpoint (loses resumable streaming). |
| iOS background suspension breaks WebSocket resume | Medium | Rely on resumable streaming; add explicit reconnect on foreground; test in M0 before building on it. |
| Supermemory ingest latency (`dreaming: dynamic` batches) makes "remember" feel broken in testing | Medium | Understand and accept eventual consistency for auto-ingest; use `addMemory` tool for explicit facts; `dreaming: "instant"` only in tests. |
| Timezone bugs in reminders | High | Always resolve times on the device (`getDeviceContext`) and store absolute epoch; unit-test the helper in `packages/shared`. |
| Cost drift from profile injection on every turn | Low-Medium | Sliding window + Supermemory per-turn caching; log OpenRouter usage per turn as a data part for visibility. |
| Tool schema rejection via OpenRouter strict mode | Medium | `strict: true` on all tools; keep zod schemas free of optional fields without defaults; test each tool with the default model. |
| Agents SDK API churn | Medium | Pin versions; the SDK's docs explicitly say to prefer current docs over memory. Re-read `docs/chat-agents.md` before M2. |

## 11. Open decisions

1. Default chat model on OpenRouter (and whether to enable `models` fallback list from day one). Config-only; pick at M0.
2. Custom domain for the Worker vs `workers.dev` for v0. `workers.dev` is fine for a personal app; a domain matters once Sign in with Apple needs stable redirect URLs.
3. Daily vs weekly `customId` rotation for Supermemory session documents. Start daily; revisit if profile quality suffers from fragmentation.
4. Whether `addMemory: "always"` (auto-ingest every turn) is desirable, or only user turns. Start with the default; observe profile noise in M2.
5. Keep `maxPersistedMessages` at 500 or lower it once memory recall is proven.
