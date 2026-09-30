import { NextResponse } from "next/server";
import { z } from "zod/v4";
import { requireUserForApi } from "@/lib/api";
import { CommandSchema, ruleBasedRoute, type Command } from "@/lib/ai/command-router";
import { generateStructured } from "@/lib/ai/structured";
import { isAIConfigured } from "@/lib/ai/provider";
import { getProvider } from "@/lib/ai/provider";

const Body = z.object({ query: z.string().trim().min(1).max(500) });

export async function POST(request: Request) {
  const auth = await requireUserForApi();
  if ("error" in auth) return auth.error;
  const { supabase, user } = auth;

  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Type what you need." }, { status: 400 });
  const query = parsed.data.query;

  let cmd: Command | null = ruleBasedRoute(query);
  if (!cmd && isAIConfigured()) {
    try {
      cmd = await generateStructured(
        { userId: user.id, feature: "command_router" },
        {
          tier: "fast",
          schemaName: "command",
          schema: CommandSchema,
          maxTokens: 400,
          system:
            "Classify a student's request in a study app. plan = wants a study schedule; revision_today = what to revise now; find_questions = look up past-paper/practice questions; quiz = wants to be tested; weak_topics = asks about weaknesses; summarize = summary of their notes/material; past_paper_stats = which topics appear often in papers; flashcards = make flashcards; search = find a file/note; navigate = open a page; tutor = any study question or explanation.",
          messages: [{ role: "user", content: query }],
        },
      );
    } catch {
      cmd = null;
    }
  }
  cmd ??= { intent: "tutor", subject: null, topic: null, days: null, minutes: null, page: null };

  // Resolve subject / topic names against the student's own workspace.
  const { data: subjects } = await supabase.from("subjects").select("id, name, code").eq("owner_id", user.id);
  const subjectText = (cmd.subject ?? query).toLowerCase();
  const subject =
    subjects?.find((s) => s.code && new RegExp(`\\b${s.code.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`).test(subjectText)) ??
    subjects?.find((s) => subjectText.includes(s.name.toLowerCase()));
  let topicId: string | null = null;
  if (cmd.topic) {
    const { data: topic } = await supabase.from("topics").select("id").eq("owner_id", user.id).ilike("name", `%${cmd.topic.slice(0, 80)}%`).limit(1).maybeSingle();
    topicId = topic?.id ?? null;
  }

  const q = encodeURIComponent(query);
  const s = subject ? `&subject=${subject.id}` : "";
  const href = (() => {
    switch (cmd.intent) {
      case "plan":
        return `/planner/new?prompt=${q}${s}${cmd.days ? `&days=${cmd.days}` : ""}${cmd.minutes ? `&minutes=${cmd.minutes}` : ""}`;
      case "revision_today":
        return "/revision";
      case "find_questions":
        return `/questions?q=${encodeURIComponent(cmd.topic ?? query)}${s}`;
      case "quiz":
        return topicId ? `/quiz?topic=${topicId}` : `/quiz?${subject ? `subject=${subject.id}` : ""}`;
      case "flashcards":
        return topicId ? `/flashcards?generate=${topicId}` : "/flashcards";
      case "weak_topics":
        return `/progress?view=weak${s}`;
      case "past_paper_stats":
        return subject ? `/past-papers/analytics?subject=${subject.id}` : "/past-papers/analytics";
      case "summarize":
        return `/tutor?mode=summarize&q=${q}`;
      case "search":
        return `/search?q=${encodeURIComponent(cmd.topic ?? query)}`;
      case "navigate":
        return `/${cmd.page ?? "dashboard"}`;
      default:
        return `/tutor?q=${q}`;
    }
  })();

  return NextResponse.json({ intent: cmd.intent, href, provider: isAIConfigured() ? getProvider().name : null });
}
