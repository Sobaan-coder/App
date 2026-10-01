import { route } from "@/lib/api";
import { withUser } from "@/lib/db";
import { getProfile } from "@/lib/profile";
import { getSettings } from "@/lib/settings";
import { dayRange } from "@/lib/time";
import { aiAvailable } from "@/services/ai/router";

/** Everything the home screen needs in one round trip. */
export const GET = route({}, async ({ user }) => {
  return withUser(user.id, async (db) => {
    const profile = await getProfile(db);
    const settings = await getSettings(db);
    const today = dayRange(profile.timezone);
    const [counts] = await db.query<Record<string, number>>(
      `select
        (select count(*)::int from tasks where status in ('todo','in_progress','waiting')) as open_tasks,
        (select count(*)::int from tasks where status in ('todo','in_progress','waiting') and due_at < now()) as overdue_tasks,
        (select count(*)::int from tasks where status = 'completed' and completed_at >= $1) as done_today,
        (select count(*)::int from approvals where status = 'pending') as pending_approvals,
        (select count(*)::int from automations where enabled) as active_automations,
        (select count(*)::int from automation_runs where status in ('queued','running','waiting','approval_required')) as active_runs,
        (select count(*)::int from automation_runs where status = 'failed' and created_at >= $1) as failed_today,
        (select count(*)::int from notifications where read_at is null) as unread_notifications,
        (select count(*)::int from content_posts where status in ('approval','draft')) as content_ready,
        (select count(*)::int from content_posts where status = 'scheduled') as content_scheduled,
        (select count(*)::int from content_posts where status = 'published' and published_at >= $1) as content_published_today,
        (select count(*)::int from content_posts where status = 'failed') as content_failed,
        (select count(*)::int from automations) as total_automations`,
      [today.start.toISOString()],
    );
    const queue = await db.query(
      `select id, title, status, progress, current_step, created_at, started_at, jsonb_array_length(plan->'steps') as total_steps,
         plan->'steps'->current_step->>'action' as current_action, result->>'summary' as summary, error
       from automation_runs order by case when status in ('running','queued','waiting','approval_required') then 0 else 1 end, created_at desc limit 8`,
    );
    const approvals = await db.query("select id, title, reason, risk_level, requires_confirmation, kind, created_at from approvals where status = 'pending' order by created_at desc limit 5");
    const tasks = await db.query(
      `select t.id, t.title, t.priority, t.status, t.due_at, p.name as project_name from tasks t left join projects p on p.id = t.project_id
       where t.status in ('todo','in_progress','waiting') order by (t.due_at is null), t.due_at, case t.priority when 'urgent' then 0 when 'high' then 1 when 'medium' then 2 else 3 end limit 6`,
    );
    const activity = await db.query("select id, created_at, message, status, run_id from activity_logs order by created_at desc limit 10");
    const suggestion = await db.one("select id, example_command, occurrences from automation_suggestions where status = 'pending' order by updated_at desc limit 1");
    const worker = await db.one<{ status: string; updated_at: string }>("select status, updated_at from system_status where component = 'worker'");
    const workerOnline = Boolean(worker && worker.status === "online" && Date.now() - new Date(worker.updated_at).getTime() < 120_000);
    return {
      user,
      profile,
      counts,
      queue,
      approvals,
      tasks,
      activity,
      suggestion,
      status: { ai: settings.ai.enabled && (await aiAvailable(db)) ? "model" : "offline", worker: workerOnline ? "online" : "offline", automationsPaused: settings.automation.paused, allowPaid: settings.ai.allowPaid },
      firstRun: !profile.onboarding_completed && counts.total_automations === 0,
    };
  });
});
