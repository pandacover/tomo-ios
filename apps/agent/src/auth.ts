const BEARER = /^Bearer\s+/i;

export function readToken(request: Request): string | null {
  const url = new URL(request.url);
  const fromQuery = url.searchParams.get("token");
  if (fromQuery) return fromQuery;
  const header = request.headers.get("authorization");
  if (!header) return null;
  return header.replace(BEARER, "").trim() || null;
}

/** Return a 401 Response to reject, or undefined to allow. */
export function authorize(request: Request, env: { APP_TOKEN?: string }): Response | undefined {
  const expected = env.APP_TOKEN;
  const token = readToken(request);
  if (!expected || !token || token !== expected) {
    return new Response("unauthorized", { status: 401 });
  }
  return undefined;
}
