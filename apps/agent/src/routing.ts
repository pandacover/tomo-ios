import { AGENT_INSTANCE } from "@tomo/shared";

/**
 * v0 is a single user. Rewrite /agents/:class/:name so the client cannot
 * pick a Durable Object instance other than `owner`.
 */
export function forceOwnerInstance(request: Request): Request {
  const url = new URL(request.url);
  const segments = url.pathname.split("/");
  const agentsIdx = segments.indexOf("agents");
  if (agentsIdx < 0 || !segments[agentsIdx + 1]) {
    return request;
  }
  if (!segments[agentsIdx + 2]) {
    segments.splice(agentsIdx + 2, 0, AGENT_INSTANCE);
  } else {
    segments[agentsIdx + 2] = AGENT_INSTANCE;
  }
  url.pathname = segments.join("/") || "/";
  return new Request(url, request);
}
