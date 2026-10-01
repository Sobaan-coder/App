import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { HttpError } from './http.ts';

const url = () => Deno.env.get('SUPABASE_URL')!;

/**
 * Client acting AS THE CALLER (their JWT). All reads/writes go through RLS and
 * the SECURITY DEFINER functions' own membership checks.
 */
export function userClient(req: Request): SupabaseClient {
  const auth = req.headers.get('authorization');
  if (!auth?.startsWith('Bearer ')) throw new HttpError(401, 'not_authenticated');
  return createClient(url(), Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: auth } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/** Service-role client: ONLY for logging/usage tracking and webhooks. Never returned to clients. */
export function serviceClient(): SupabaseClient {
  return createClient(url(), Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export async function requireUser(client: SupabaseClient) {
  const { data, error } = await client.auth.getUser();
  if (error || !data.user) throw new HttpError(401, 'not_authenticated');
  return data.user;
}

/** Records a sanitized server error for the admin "System health" view. */
export async function logError(source: string, code: string, message: string, ctx: Record<string, unknown> = {}) {
  try {
    await serviceClient().from('app_errors').insert({
      source, code, message: message.slice(0, 500),
      business_id: ctx.business_id ?? null, user_id: ctx.user_id ?? null,
      context: Object.fromEntries(Object.entries(ctx).filter(([k]) => !['business_id', 'user_id'].includes(k))),
    });
  } catch (_) { /* never let logging break a request */ }
}
