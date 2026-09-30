import type { Metadata } from "next";
import Link from "next/link";
import { CalendarClock, Layers, Play, Repeat } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/common/page-header";
import { EmptyState } from "@/components/common/empty-state";
import { TopicReviewList } from "@/components/flashcards/topic-review";
import { requireUser } from "@/lib/auth";
import { formatDate } from "@/lib/format";

export const metadata: Metadata = { title: "Revision" };

export default async function RevisionPage() {
  const { supabase, user } = await requireUser();
  const now = new Date().toISOString();
  const week = new Date(Date.now() + 7 * 86_400_000).toISOString();
  const [due, upcoming, cardsDue, cardsTotal] = await Promise.all([
    supabase.from("student_topic_progress").select("topic_id, confidence, review_count, next_review_at, topics(name, subjects(code, name))").eq("user_id", user.id).lte("next_review_at", now).order("next_review_at").limit(30),
    supabase.from("student_topic_progress").select("topic_id, next_review_at, topics(name)").eq("user_id", user.id).gt("next_review_at", now).lte("next_review_at", week).order("next_review_at").limit(20),
    supabase.from("flashcards").select("id", { count: "exact", head: true }).eq("user_id", user.id).lte("due_at", now),
    supabase.from("flashcards").select("id", { count: "exact", head: true }).eq("user_id", user.id),
  ]);
  const items = (due.data ?? []).map((d) => {
    const t = d.topics as { name: string; subjects: { code: string | null; name: string } | null } | null;
    return { topicId: d.topic_id, name: t?.name ?? "Topic", subject: t?.subjects?.code || t?.subjects?.name || "", confidence: d.confidence, reviewCount: d.review_count };
  });

  return (
    <div className="space-y-6">
      <PageHeader title="Today's Revision" description="Spaced repetition: topics and cards come back just before you'd forget them. Rate how well you know each one." />
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Card className="min-w-0 lg:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Repeat className="size-4" /> Topics due ({items.length})
            </CardTitle>
            <CardDescription>Quickly recall the key points, then rate: Again · Hard · Good · Easy.</CardDescription>
          </CardHeader>
          <CardContent>
            {items.length ? (
              <TopicReviewList items={items} />
            ) : (
              <EmptyState icon={Repeat} title="Nothing due right now" description="Study topics and rate your confidence — Study OS schedules reviews automatically." className="border-0 bg-transparent py-6" />
            )}
          </CardContent>
        </Card>
        <div className="min-w-0 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Layers className="size-4" /> Flashcards
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-3xl font-semibold tabular-nums">{cardsDue.count ?? 0}</p>
              <p className="text-sm text-muted-foreground">due of {cardsTotal.count ?? 0} cards</p>
              <div className="flex gap-2">
                <Button asChild size="sm" disabled={!cardsDue.count}>
                  <Link href="/flashcards/review">
                    <Play /> Review
                  </Link>
                </Button>
                <Button asChild size="sm" variant="outline">
                  <Link href="/flashcards">All cards</Link>
                </Button>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <CalendarClock className="size-4" /> Coming up this week
              </CardTitle>
            </CardHeader>
            <CardContent>
              {upcoming.data?.length ? (
                <ul className="space-y-1.5 text-sm">
                  {upcoming.data.map((u) => (
                    <li key={u.topic_id} className="flex justify-between gap-2">
                      <span className="truncate">{(u.topics as { name: string } | null)?.name}</span>
                      <span className="shrink-0 text-muted-foreground">{formatDate(u.next_review_at!)}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-muted-foreground">No reviews scheduled this week.</p>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
