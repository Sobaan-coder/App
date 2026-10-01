// HTTP helpers shared by every Edge Function.

const ALLOWED_ORIGINS = (Deno.env.get('ALLOWED_ORIGINS') ?? '*').split(',').map((s) => s.trim());

export function corsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get('origin') ?? '';
  const allow = ALLOWED_ORIGINS.includes('*') ? '*' : (ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0]);
  return {
    'access-control-allow-origin': allow,
    'access-control-allow-headers': 'authorization, x-client-info, apikey, content-type',
    'access-control-allow-methods': 'POST, OPTIONS',
    vary: 'origin',
  };
}

export function json(req: Request, body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', ...corsHeaders(req) },
  });
}

export class HttpError extends Error {
  constructor(readonly status: number, readonly code: string, message?: string) {
    super(message ?? code);
  }
}

/** Map Postgres/PostgREST errors raised by our SQL functions to safe HTTP errors. */
export function fromDbError(e: { message?: string; code?: string } | null): HttpError {
  const msg = e?.message ?? 'database_error';
  if (/not_authenticated/.test(msg)) return new HttpError(401, 'not_authenticated');
  if (/not_found/.test(msg)) return new HttpError(404, msg.match(/not_found(:\w+)?/)![0]);
  if (/forbidden/.test(msg)) return new HttpError(403, 'forbidden');
  if (/plan_limit:\w+/.test(msg)) return new HttpError(402, msg.match(/plan_limit:\w+/)![0]);
  if (/invalid_input:\w+/.test(msg)) return new HttpError(400, msg.match(/invalid_input:\w+/)![0]);
  return new HttpError(500, 'database_error');
}

export async function readJson<T>(req: Request, maxBytes = 64_000): Promise<T> {
  const text = await req.text();
  if (text.length > maxBytes) throw new HttpError(413, 'payload_too_large');
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new HttpError(400, 'invalid_json');
  }
}

/** Wrap a handler: CORS preflight, method check, uniform error output (no stack traces to clients). */
export function serve(handler: (req: Request) => Promise<Response>) {
  Deno.serve(async (req) => {
    if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders(req) });
    if (req.method !== 'POST') return json(req, { error: 'method_not_allowed' }, 405);
    try {
      return await handler(req);
    } catch (e) {
      if (e instanceof HttpError) return json(req, { error: e.code }, e.status);
      console.error(JSON.stringify({ level: 'error', fn: new URL(req.url).pathname, error: (e as Error).message }));
      return json(req, { error: 'internal_error' }, 500);
    }
  });
}
