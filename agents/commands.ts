import { withUser } from "@/lib/db";
import { logActivity } from "@/lib/activity";
import { startRun } from "@/automations/service";
import { planCommand } from "./planner";
import { commandSignature, type Intent } from "./intent";
import { getSettings } from "@/lib/settings";
import { nameVariants, stripWakeWord } from "@/lib/wake";
import { normalizeCommand, type Lang } from "@/services/language";
import { ackFor } from "@/services/language/replies";

/** Intents where "you do this often — automate it?" makes sense. */
const DISCOVERABLE: Intent[] = [
  "plan_day",
  "plan_tomorrow",
  "what_next",
  "unfinished_tasks",
  "deadlines",
  "end_of_day_review",
  "weekly_report",
  "summarize_documents",
  "organize_files",
  "spreadsheet_changes",
  "spreadsheet_analyze",
  "generate_document",
  "research",
  "content_create",
  "content_plan",
  "show_activity",
];

export const DISCOVERY_THRESHOLD = 3;

export interface CommandResult {
  runId: string;
  intent: string;
  goal: string;
  steps: { id: string; action: string; tool?: string }[];
  requiresApproval: boolean;
  suggestion: { id: string; example: string; occurrences: number } | null;
  /** Language the command was given in, and the language used for the reply. */
  lang: Lang;
  replyLang: Lang;
  /** The English command the planner used (equal to the input for English). */
  understoodAs: string;
  /** Short acknowledgement in the user's language (shown and spoken). */
  reply: string;
}

/** USER → INTENT → PLAN → (queued) EXECUTION. Returns immediately; the worker runs the plan. */
export async function handleCommand(userId: string, text: string, opts: { projectId?: string | null } = {}): Promise<CommandResult> {
  // "Saathi, plan my day" → "plan my day"; Urdu / Roman Urdu → English command for the planner.
  const prep = await withUser(userId, async (db) => {
    const s = await getSettings(db);
    const stripped = stripWakeWord(text, nameVariants(s.assistant.name, [s.assistant.urduName, ...s.assistant.aliases]));
    const n = await normalizeCommand(db, userId, stripped);
    return { settings: s, stripped, n };
  });
  const lang = prep.n.lang;
  const replyLang: Lang = prep.settings.assistant.replyLanguage === "auto" ? lang : prep.settings.assistant.replyLanguage;
  const plan = await withUser(userId, (db) => planCommand(db, userId, prep.n.english, { lang: replyLang, original: prep.stripped }));
  // keep run titles in the user's own words for free-form requests
  if (prep.n.method !== "unchanged" && plan.goal === prep.n.english.trim().slice(0, 160)) plan.goal = prep.stripped.slice(0, 160);
  const runId = await startRun({
    userId,
    title: plan.goal,
    source: plan.intent.startsWith("content") || plan.intent === "image_generate" ? "content" : "command",
    plan,
    projectId: opts.projectId ?? plan.projectId,
    commandText: text,
  });

  const signature = commandSignature(plan.intent as Intent, prep.n.english);
  const suggestion = await withUser(userId, async (db) => {
    await db.query("insert into command_history(user_id, command, intent, signature, run_id) values ($1,$2,$3,$4,$5)", [userId, text.slice(0, 2000), plan.intent, signature, runId]);
    await logActivity(db, { userId, runId, category: "command", action: "command.received", message: `Command: "${text.slice(0, 140)}" → ${plan.intent} (${plan.steps.length} steps)` });
    if (!DISCOVERABLE.includes(plan.intent as Intent)) return null;
    const count = await db.one<{ n: number }>("select count(*)::int as n from command_history where signature = $1 and created_at > now() - interval '30 days'", [signature]);
    if ((count?.n ?? 0) < DISCOVERY_THRESHOLD) return null;
    const existing = await db.one<{ id: string; status: string }>("select id, status from automation_suggestions where signature = $1", [signature]);
    if (existing && existing.status !== "pending") return null; // accepted or dismissed: never nag again
    const row = await db.one<{ id: string; occurrences: number }>(
      `insert into automation_suggestions(user_id, signature, example_command, occurrences) values ($1,$2,$3,$4)
       on conflict (user_id, signature) do update set occurrences = excluded.occurrences, example_command = excluded.example_command, updated_at = now()
       returning id, occurrences`,
      [userId, signature, text.slice(0, 500), count!.n],
    );
    return { id: row!.id, example: text, occurrences: row!.occurrences };
  });

  return {
    runId,
    intent: plan.intent,
    goal: plan.goal,
    steps: plan.steps.map((s) => ({ id: s.id, action: s.action, tool: s.tool })),
    requiresApproval: plan.requiresApproval,
    suggestion,
    lang,
    replyLang,
    understoodAs: prep.n.english,
    reply: ackFor(plan.intent, replyLang),
  };
}
