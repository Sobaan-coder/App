// POST /functions/v1/subscription-webhook?provider=stripe|google_play
// Payment providers notify us here. Subscriptions are ONLY changed by this
// server-side function (service role) after the event is verified. Card data
// never touches BusinessPilot. Events are stored idempotently in payment_events.
//
// Secrets: STRIPE_WEBHOOK_SECRET, GOOGLE_PLAY_PUBSUB_TOKEN
// Deploy with --no-verify-jwt (providers don't send Supabase JWTs).
import { HttpError, json } from '../_shared/http.ts';
import { safeEqual, verifyStripeSignature } from '../_shared/stripe.ts';
import { logError, serviceClient } from '../_shared/supabase.ts';

const STATUS_MAP: Record<string, string> = {
  active: 'active', trialing: 'trialing', past_due: 'past_due', unpaid: 'past_due',
  canceled: 'cancelled', incomplete_expired: 'expired', incomplete: 'past_due',
};

async function handleStripe(req: Request, raw: string) {
  const secret = Deno.env.get('STRIPE_WEBHOOK_SECRET');
  if (!secret) throw new HttpError(503, 'not_configured');
  if (!(await verifyStripeSignature(raw, req.headers.get('stripe-signature') ?? '', secret))) {
    throw new HttpError(400, 'invalid_signature');
  }
  const event = JSON.parse(raw);
  const db = serviceClient();
  const obj = event.data?.object ?? {};
  const businessId: string | undefined = obj.metadata?.business_id ?? obj.subscription_details?.metadata?.business_id;

  const { error: dupErr } = await db.from('payment_events').insert({
    provider: 'stripe', event_id: event.id, type: event.type, business_id: businessId ?? null, payload: event,
  });
  if (dupErr?.code === '23505') return { duplicate: true };          // already processed

  if (businessId && event.type.startsWith('customer.subscription.')) {
    const priceId = obj.items?.data?.[0]?.price?.id;
    const { data: plan } = await db.from('plans').select('id').eq('stripe_price_id', priceId).maybeSingle();
    await db.from('subscriptions').update({
      plan_id: event.type === 'customer.subscription.deleted' ? 'free' : (plan?.id ?? 'free'),
      status: event.type === 'customer.subscription.deleted' ? 'cancelled' : (STATUS_MAP[obj.status] ?? 'past_due'),
      provider: 'stripe', provider_customer_id: obj.customer, provider_subscription_id: obj.id,
      current_period_start: obj.current_period_start ? new Date(obj.current_period_start * 1000).toISOString() : null,
      current_period_end: obj.current_period_end ? new Date(obj.current_period_end * 1000).toISOString() : null,
      cancel_at_period_end: Boolean(obj.cancel_at_period_end),
    }).eq('business_id', businessId);
    await db.from('analytics_events').insert({
      event: event.type === 'customer.subscription.deleted' ? 'subscription_cancelled' : 'subscription_started',
      business_id: businessId, properties: { provider: 'stripe', plan: plan?.id },
    });
  }
  await db.from('payment_events').update({ processed_at: new Date().toISOString() }).eq('provider', 'stripe').eq('event_id', event.id);
  return { received: true };
}

async function handleGooglePlay(req: Request, raw: string) {
  // Real-time developer notifications arrive via a Pub/Sub push subscription.
  const token = new URL(req.url).searchParams.get('token');
  const expected = Deno.env.get('GOOGLE_PLAY_PUBSUB_TOKEN');
  if (!expected || !token || !safeEqual(token, expected)) throw new HttpError(401, 'unauthorized');
  const body = JSON.parse(raw);
  const data = JSON.parse(atob(body.message?.data ?? '') || '{}');
  const db = serviceClient();
  await db.from('payment_events').insert({
    provider: 'google_play', event_id: body.message?.messageId ?? crypto.randomUUID(),
    type: data.subscriptionNotification ? `subscription.${data.subscriptionNotification.notificationType}` : 'other',
    payload: data,
  });
  // TODO(google-play-billing): verify `data.subscriptionNotification.purchaseToken` with the
  // Google Play Developer API (purchases.subscriptionsv2.get) using a service account, map
  // obfuscatedExternalAccountId -> business_id and productId -> plans.google_play_product_id,
  // then update public.subscriptions. Plans are never granted from an unverified notification.
  return { received: true, verified: false };
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json(req, { error: 'method_not_allowed' }, 405);
  try {
    const raw = await req.text();
    if (raw.length > 512_000) throw new HttpError(413, 'payload_too_large');
    const provider = new URL(req.url).searchParams.get('provider') ?? 'stripe';
    const result = provider === 'google_play' ? await handleGooglePlay(req, raw) : await handleStripe(req, raw);
    return json(req, result);
  } catch (e) {
    if (e instanceof HttpError) return json(req, { error: e.code }, e.status);
    await logError('subscription-webhook', 'payment_failure', (e as Error).message);
    return json(req, { error: 'internal_error' }, 500);
  }
});
