import { looksLikeAutomation } from "@/workflows/nl-automation";

/**
 * INTENT DETECTION — deterministic rules first (fast, free, predictable).
 * Unknown requests fall back to an LLM classifier in the planner when a model is available.
 */
export type Intent =
  | "create_automation"
  | "automation_list"
  | "automation_pause_all"
  | "automation_resume_all"
  | "automation_pause"
  | "automation_resume"
  | "explain_failure"
  | "retry"
  | "memory_save"
  | "memory_forget"
  | "memory_recall"
  | "show_activity"
  | "content_plan"
  | "content_create"
  | "content_publish"
  | "content_status"
  | "image_generate"
  | "task_create"
  | "task_complete"
  | "plan_day"
  | "plan_tomorrow"
  | "what_next"
  | "unfinished_tasks"
  | "deadlines"
  | "end_of_day_review"
  | "weekly_report"
  | "summarize_documents"
  | "organize_files"
  | "spreadsheet_changes"
  | "spreadsheet_analyze"
  | "generate_document"
  | "research"
  | "web_screenshot"
  | "web_read"
  | "email"
  | "project_create"
  | "calendar_event"
  | "identity"
  | "greeting"
  | "general";

export interface DetectedIntent {
  intent: Intent;
  confidence: number;
  entities: Record<string, string | undefined>;
}

const URL_RE = /https?:\/\/[^\s,)]+/i;

function after(re: RegExp, text: string): string | undefined {
  const m = re.exec(text);
  return m?.[1]?.trim().replace(/[.?!]+$/, "") || undefined;
}

export function detectIntent(raw: string): DetectedIntent {
  const text = raw.trim();
  const t = text.toLowerCase();
  const url = URL_RE.exec(text)?.[0]?.replace(/[.,]+$/, "");
  const hit = (intent: Intent, entities: Record<string, string | undefined> = {}, confidence = 0.9): DetectedIntent => ({ intent, confidence, entities: { url, ...entities } });

  // ── about the assistant ──
  if (/\b(what('?s| is) your name|who are you|what are you called|introduce yourself)\b/.test(t)) return hit("identity");
  if (/^(hi|hello|hey|salam|assalam[\w ]*|good (morning|afternoon|evening))[!. ]*$/.test(t)) return hit("greeting");

  // ── automation control ──
  if (/\b(pause|stop|disable) (all|every|my) (automations?|workflows?)\b|\bpause all\b/.test(t)) return hit("automation_pause_all");
  if (/\b(resume|restart|enable|unpause) (all|every|my) (automations?|workflows?)\b|\bresume all\b/.test(t)) return hit("automation_resume_all");
  if (/\b(show|list|what are|which are)\b.*\b(automations?|workflows?)\b/.test(t) && !/\bcreate\b/.test(t)) return hit("automation_list");
  if (/\bwhy did\b.*\bfail|\bwhat went wrong\b|\bwhy (has|is) .* fail/.test(t)) return hit("explain_failure", { name: after(/why did (?:the |my )?(.+?) (?:automation |workflow )?fail/, t) });
  if (/^(please )?(retry|try again|run it again|rerun)\b|\bretry (it|that|the last)\b/.test(t)) return hit("retry");
  const pauseOne = /^(pause|disable) (?:the )?(.+?)(?: automation| workflow)?$/.exec(t);
  if (pauseOne && !/all/.test(pauseOne[2])) return hit("automation_pause", { name: pauseOne[2] }, 0.7);
  const resumeOne = /^(resume|enable) (?:the )?(.+?)(?: automation| workflow)?$/.exec(t);
  if (resumeOne && !/all/.test(resumeOne[2])) return hit("automation_resume", { name: resumeOne[2] }, 0.7);

  // ── memory ──
  if (/^(please )?remember (that |this: ?)?/.test(t) && !/\bremember to\b/.test(t)) return hit("memory_save", { content: text.replace(/^(please )?remember (that |this: ?)?/i, "") });
  if (/^(please )?forget\b/.test(t)) return hit("memory_forget", { query: text.replace(/^(please )?forget( about| that| the)?\s*/i, "") });
  if (/\bwhat do you (remember|know)\b|\bshow (me )?what you remember\b|\bwhat have you remembered\b|\bmy preferences\b/.test(t))
    return hit("memory_recall", { query: after(/(?:remember|know) about (?:the |my )?(?:project )?(.+)$/, t) });
  if (/^update (my )?(preference|memory)/.test(t)) return hit("memory_save", { content: text.replace(/^update (my )?(preference|memory)( about)?:?\s*/i, "") });

  // ── activity ──
  if (/\b(today'?s|recent) activity\b|\bshow (me )?(the )?activity\b|\bwhat (did|have) you (do|done)\b/.test(t)) return hit("show_activity");

  // ── automations from natural language ──
  if (looksLikeAutomation(text)) return hit("create_automation", {}, 0.85);

  // ── content studio ──
  const social = /\b(post|posts|caption|captions|content|instagram|insta|facebook|tiktok|reel|reels|youtube|shorts|snapchat|hashtags?|social media)\b/.test(t);
  if (/\b(\d+|seven) days? of content\b|\bcontent (plan|calendar|strategy)\b|\bplan (my|the) content\b/.test(t)) return hit("content_plan");
  if (/\b(show|list)\b.*\b(scheduled|failed|published|pending) posts\b|\b(scheduled|failed) posts\b/.test(t)) return hit("content_status", { status: after(/\b(scheduled|failed|published|pending) posts/, t) });
  if (/\b(create|make|generate|design)\b.*\b(image|picture|photo|visual|poster)\b/.test(t) && !/\bpost\b/.test(t)) return hit("image_generate");
  if (social && /\b(publish|post it|post to|post on|and post|upload to|share (it )?(to|on))\b/.test(t) && !/\bpostpone\b/.test(t)) return hit("content_publish");
  if (social && /\b(create|make|generate|prepare|write|draft|give me|need)\b|\btoday'?s content\b/.test(t)) return hit("content_create");

  // ── tasks ──
  if (/^(mark|set)\b.*\b(done|complete|completed|finished)\b|^(i )?(finished|completed|done with)\b/.test(t))
    return hit("task_complete", { title: text.replace(/^(mark|set)\s+(the\s+)?(task\s+)?/i, "").replace(/\s+(as\s+)?(done|complete|completed|finished)\.?$/i, "").replace(/^(i )?(finished|completed|done with)\s+(the\s+)?/i, "") });
  if (/\b(remind me|add (a |an )?(\w+ priority )?(task|todo|to-do)|create (a |an )?(\w+ priority )?(task|todo|reminder)|new task|^todo:|^task:|add .+ to my (list|tasks|todo))/.test(t)) return hit("task_create");
  if (/\bschedule (a |an )?(meeting|call|event|appointment)\b|\badd .+ to (my )?calendar\b/.test(t)) return hit("calendar_event");
  if (/\bend[- ]of[- ]day\b|\b(daily|evening) review\b|\bwrap up (my|the) day\b/.test(t)) return hit("end_of_day_review");
  if (/\bweekly report\b|\bweek'?s report\b|\breport (for|of|on) (this|the) week\b/.test(t)) return hit("weekly_report");
  if (/\btomorrow'?s (schedule|plan)\b|\bplan (for )?tomorrow\b|\bprepare tomorrow\b/.test(t)) return hit("plan_tomorrow");
  if (/\bplan (my|the) day\b|\b(today'?s|daily|my) (work )?(plan|schedule|agenda)\b|\bwhat'?s (on )?my (plan|agenda)\b/.test(t)) return hit("plan_day");
  if (/\bwhat should i (work on|do|focus on)( next)?\b|\bnext task\b|\bwhat'?s next\b/.test(t)) return hit("what_next");
  if (/\bdeadlines?\b/.test(t)) return hit("deadlines", { project: after(/deadlines? (?:for|in) (?:the |my )?(?:project )?(.+)$/, t) });
  if (/\b(unfinished|incomplete|pending|open|outstanding|remaining)\b.*\b(tasks?|work|to-?dos?)\b|\bfind unfinished\b|\bshow (me )?(my )?tasks\b|\bwhat'?s left\b/.test(t))
    return hit("unfinished_tasks", { project: after(/(?:for|in) (?:the |my )?(?:project )?([a-z][\w ]{1,40})$/, t) });

  // ── projects ──
  const proj = /\b(?:create|make|start|new)\s+(?:a\s+)?(?:new\s+)?(study |business |personal )?project\s+(?:called|named)?\s*["“]?([^"”]+?)["”]?$/i.exec(text);
  if (proj) return hit("project_create", { name: proj[2], kind: proj[1]?.trim().toLowerCase() });

  // ── files & documents ──
  if (/\borgani[sz]e\b.*\b(files|downloads|uploads|documents|folder)\b/.test(t)) return hit("organize_files", { folder: /downloads/.test(t) ? "downloads" : "uploads" });
  if (/\b(spreadsheet|excel|xlsx|csv|sheet)\b.*\b(changed|changes|difference|compare|diff)\b|\bwhat changed\b/.test(t)) return hit("spreadsheet_changes", { name: after(/["“]([^"”]+)["”]/, text) });
  if (/\b(analy[sz]e|read|check|look at)\b.*\b(spreadsheet|excel|xlsx|csv|sheet|sales data)\b/.test(t)) return hit("spreadsheet_analyze", { name: after(/["“]([^"”]+)["”]/, text) });
  if (url && /\b(screenshot|capture)\b/.test(t)) return hit("web_screenshot");
  if (url) return hit("web_read");
  if (/\b(summari[sz]e|summary of|tl;?dr|key points|action items)\b/.test(t))
    return hit("summarize_documents", { since: /\btoday\b/.test(t) ? "today" : /\bthis week\b/.test(t) ? "week" : undefined, name: after(/["“]([^"”]+)["”]/, text) ?? after(/summari[sz]e (?:the |my )?(?:file |document |pdf )?([\w\- ]+\.\w{2,4})/i, text) });
  if (/\bresearch\b|\blook up\b|\bfind (information|info|out) (on|about)\b|\binvestigate\b/.test(t))
    return hit("research", { topic: after(/(?:research|look up|find (?:information|info|out) (?:on|about)|investigate)\s+(?:about\s+|on\s+)?(.+?)(?:\s+and\s+(?:create|make|write)\b.*)?$/i, text) });
  if (/\b(email|e-mail|mail)\b/.test(t) && /\b(send|write|draft|compose|reply)\b/.test(t))
    return hit("email", { to: /[\w.+-]+@[\w-]+\.[\w.]+/.exec(text)?.[0], send: /\bsend\b/.test(t) ? "yes" : undefined });
  if (/\b(create|make|generate|write|prepare|turn|convert|draft)\b.*\b(report|document|pdf|docx|word|excel|spreadsheet|invoice|letter|memo|proposal|summary|essay|notes)\b/.test(t)) return hit("generate_document");

  return { intent: "general", confidence: 0.2, entities: { url } };
}

/** Normalised command signature for "you do this often" detection. */
export function commandSignature(intent: Intent, text: string): string {
  const core = text
    .toLowerCase()
    .replace(/https?:\/\/\S+/g, "<url>")
    .replace(/["“][^"”]*["”]/g, "<x>")
    .replace(/\d+/g, "#")
    .replace(/[^a-z<># ]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 3 && !["please", "could", "would", "that", "this", "these", "those", "with", "from", "have"].includes(w))
    .slice(0, 5)
    .join(" ");
  return `${intent}:${core}`;
}
