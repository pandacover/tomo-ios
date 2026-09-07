import { routeAgentRequest } from "agents";
import { authorize } from "./auth";
import { forceOwnerInstance } from "./routing";

export { AssistantAgent } from "./assistant-agent";

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (request.method === "GET" && url.pathname === "/health") {
      return new Response("ok");
    }

    const routed = forceOwnerInstance(request);
    return (
      (await routeAgentRequest(routed, env, {
        onBeforeConnect: (req) => authorize(req, env),
        onBeforeRequest: (req) => authorize(req, env),
      })) ?? new Response("not found", { status: 404 })
    );
  },
} satisfies ExportedHandler<Env>;
