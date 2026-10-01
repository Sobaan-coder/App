// POST /functions/v1/send-notification   (header: x-cron-secret: $CRON_SECRET)
// Scheduled (e.g. hourly via Supabase Cron). Generates in-app notifications in
// SQL (low stock, payment reminders, daily summary, monthly report) and then
// delivers push notifications for new rows.
// Deploy with --no-verify-jwt; protected by CRON_SECRET instead.
import { HttpError, json } from '../_shared/http.ts';
import { logError, serviceClient } from '../_shared/supabase.ts';

Deno.serve(async (req) => {
  try {
    const secret = Deno.env.get('CRON_SECRET');
    if (!secret || req.headers.get('x-cron-secret') !== secret) throw new HttpError(401, 'unauthorized');
    const db = serviceClient();
    const { data, error } = await db.rpc('generate_scheduled_notifications');
    if (error) throw new Error(error.message);
    // TODO(push): for each new notification, look up device tokens (device_tokens table, future)
    // and send via FCM HTTP v1 with a service-account JWT. In-app notifications already work.
    return json(req, { created: data ?? 0 });
  } catch (e) {
    if (e instanceof HttpError) return json(req, { error: e.code }, e.status);
    await logError('send-notification', 'notification_failure', (e as Error).message);
    return json(req, { error: 'internal_error' }, 500);
  }
});
