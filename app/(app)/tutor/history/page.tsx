import type { Metadata } from "next";
import Link from "next/link";
import { MessageSquare } from "lucide-react";
import { PageHeader } from "@/components/common/page-header";
import { EmptyState } from "@/components/common/empty-state";
import { Button } from "@/components/ui/button";
import { requireUser } from "@/lib/auth";
import { formatDate } from "@/lib/format";

export const metadata: Metadata = { title: "Tutor history" };

export default async function TutorHistoryPage() {
  const { supabase, user } = await requireUser();
  const { data } = await supabase.from("ai_conversations").select("id, title, updated_at").eq("user_id", user.id).order("updated_at", { ascending: false }).limit(100);
  return (
    <div>
      <PageHeader title="Conversations" actions={<Button asChild><Link href="/tutor">New conversation</Link></Button>} />
      {data?.length ? (
        <ul className="space-y-2">
          {data.map((c) => (
            <li key={c.id}>
              <Link href={`/tutor/${c.id}`} className="flex items-center justify-between gap-3 rounded-xl border bg-card px-4 py-3 hover:bg-accent/40">
                <span className="truncate text-sm font-medium">{c.title}</span>
                <span className="shrink-0 text-xs text-muted-foreground">{formatDate(c.updated_at)}</span>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState icon={MessageSquare} title="No conversations yet" description="Ask the AI tutor anything about your subjects." action={<Button asChild><Link href="/tutor">Ask the tutor</Link></Button>} />
      )}
    </div>
  );
}
