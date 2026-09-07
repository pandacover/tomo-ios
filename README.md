# tomo

Personal AI assistant for iPhone. One Cloudflare Worker, one Expo app, one user.

v0 is a single continuous thread with resumable streaming, Supermemory-backed long-term memory, OpenRouter models, reminders via Expo Push, and web search. See [docs/v0-plan.md](docs/v0-plan.md) for architecture and decisions.

## Repo

```
apps/agent     Cloudflare Worker (AssistantAgent Durable Object)
apps/mobile    Expo / Expo Router iOS app
packages/shared  zod schemas and helpers used by both
```

## Prerequisites

- [Bun](https://bun.sh)
- A Cloudflare account (Workers + Durable Objects)
- OpenRouter and Supermemory API keys
- An Apple Developer account and [EAS](https://docs.expo.dev/eas/) for a real iOS build (push notifications do not work in Expo Go)

## Agent

```bash
bun install
cp apps/agent/.dev.vars.example apps/agent/.dev.vars
# fill APP_TOKEN, OPENROUTER_API_KEY, SUPERMEMORY_API_KEY
bun run dev:agent
```

The Worker listens on `http://localhost:8787`. `GET /health` is unauthenticated. Everything under `/agents/*` requires `?token=` or `Authorization: Bearer`.

```bash
bun run --filter @tomo/agent deploy
bunx wrangler secret put APP_TOKEN --config apps/agent/wrangler.jsonc
bunx wrangler secret put OPENROUTER_API_KEY --config apps/agent/wrangler.jsonc
bunx wrangler secret put SUPERMEMORY_API_KEY --config apps/agent/wrangler.jsonc
```

The production hostname is `tomo-agent.<account>.workers.dev`.

## iOS app

Push and a reliable WebSocket need a dev client, not Expo Go:

```bash
cd apps/mobile
bunx eas init          # writes extra.eas.projectId
bunx eas build --profile development --platform ios
bun run start
```

On first launch, paste the Worker host and `APP_TOKEN`.

## Checks

```bash
bun run lint
bun run typecheck
bun run test
bun run --filter @tomo/agent dry-run
```

CI runs those on every PR and deploys the Worker from `main` when `CLOUDFLARE_API_TOKEN` / `CLOUDFLARE_ACCOUNT_ID` are set.

## Effect

Effect is used in two places only — not as a rewrite of the agent or chat loop:

- **Worker** (`apps/agent/src/push.ts`): Expo Push send as an `Effect` with tagged errors (`NoDevices`, `PushHttpError`, `PushTicketError`), HTTP 5xx/network retry, and `DeviceNotRegistered` pruning. `sendReminder` keeps the row and reschedules on failure.
- **iOS** (`apps/mobile/src/lib/notifications.ts`, `assistant-context.tsx`): fetch the Expo push token, wait until the agent stub is callable, then `registerDevice` / `updatePrefs({ timezone })` with retries. Failures surface as an in-app banner instead of failing closed silently.
