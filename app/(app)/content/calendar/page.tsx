"use client";
import Link from "next/link";
import { useMemo, useState } from "react";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import { api, useApi } from "@/lib/client";
import { PostStatus, Thumb, type PostRow } from "@/components/post-bits";
import { Button, Card, PageHeader, Tabs, cx, useToast } from "@/components/ui";

type View = "month" | "week" | "day";
const STATUS_DOT: Record<string, string> = { idea: "bg-muted", draft: "bg-muted", approval: "bg-warn", approved: "bg-accent", scheduled: "bg-gold", published: "bg-ok", failed: "bg-bad", rejected: "bg-bad" };

function startOfDay(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}
function addDays(d: Date, n: number) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
}

export default function CalendarPage() {
  const toast = useToast();
  const [view, setView] = useState<View>("month");
  const [cursor, setCursor] = useState(startOfDay(new Date()));
  const [dragId, setDragId] = useState<string | null>(null);

  const days = useMemo(() => {
    if (view === "day") return [cursor];
    if (view === "week") {
      const s = addDays(cursor, -((cursor.getDay() + 6) % 7));
      return Array.from({ length: 7 }, (_, i) => addDays(s, i));
    }
    const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
    const s = addDays(first, -((first.getDay() + 6) % 7));
    return Array.from({ length: 42 }, (_, i) => addDays(s, i));
  }, [view, cursor]);
  const from = days[0];
  const to = addDays(days[days.length - 1], 1);
  const { data, reload } = useApi<{ posts: PostRow[] }>(`/api/content/posts?from=${from.toISOString()}&to=${to.toISOString()}`, 15_000);
  const byDay = (d: Date) => (data?.posts ?? []).filter((p) => startOfDay(new Date(p.scheduled_at ?? p.created_at)).getTime() === d.getTime());

  const move = (n: number) => setCursor(view === "month" ? new Date(cursor.getFullYear(), cursor.getMonth() + n, 1) : addDays(cursor, n * (view === "week" ? 7 : 1)));
  const drop = async (d: Date) => {
    const post = data?.posts.find((p) => p.id === dragId);
    setDragId(null);
    if (!post) return;
    if (post.status === "published") return toast("Published posts can't be moved", "bad");
    const old = new Date(post.scheduled_at ?? post.created_at);
    const next = new Date(d.getFullYear(), d.getMonth(), d.getDate(), old.getHours() || 19, old.getMinutes());
    await api(`/api/content/posts/${post.id}`, { method: "PATCH", body: { scheduledAt: next.toISOString() } });
    toast(`Moved “${post.title}” to ${next.toDateString()}`, "ok");
    reload();
  };
  const title = view === "month" ? cursor.toLocaleDateString(undefined, { month: "long", year: "numeric" }) : view === "week" ? `Week of ${days[0].toLocaleDateString()}` : cursor.toLocaleDateString(undefined, { dateStyle: "full" });

  return (
    <div>
      <PageHeader
        title="Content Calendar"
        icon={<CalendarDays className="h-6 w-6" />}
        subtitle="Drag a post to another date. Statuses: idea → draft → approval → approved → scheduled → published / failed."
        actions={
          <Button
            onClick={async () => {
              const r = await api<{ runId: string }>("/api/command", { body: { text: "Create 7 days of content" } });
              toast("Planning next week…", "ok");
              window.location.href = `/runs/${r.runId}`;
            }}
          >
            Plan 7 days
          </Button>
        }
      />
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Button size="sm" onClick={() => move(-1)} aria-label="Previous">
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <Button size="sm" onClick={() => setCursor(startOfDay(new Date()))}>
          Today
        </Button>
        <Button size="sm" onClick={() => move(1)} aria-label="Next">
          <ChevronRight className="h-4 w-4" />
        </Button>
        <span className="ml-2 text-sm font-semibold">{title}</span>
        <div className="ml-auto">
          <Tabs value={view} onChange={setView} items={[{ value: "month", label: "Month" }, { value: "week", label: "Week" }, { value: "day", label: "Day" }]} />
        </div>
      </div>
      <Card className="overflow-hidden">
        {view !== "day" && (
          <div className="grid grid-cols-7 border-b border-line text-center text-[11px] font-semibold text-muted">
            {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => (
              <div key={d} className="py-2">
                {d}
              </div>
            ))}
          </div>
        )}
        <div className={cx("grid", view === "day" ? "grid-cols-1" : "grid-cols-7")}>
          {days.map((d) => {
            const posts = byDay(d);
            const outside = view === "month" && d.getMonth() !== cursor.getMonth();
            const today = d.getTime() === startOfDay(new Date()).getTime();
            return (
              <div
                key={d.toISOString()}
                onDragOver={(e) => e.preventDefault()}
                onDrop={() => drop(d)}
                className={cx("min-h-24 border-r border-b border-line p-1.5 sm:min-h-28", outside && "bg-panel-2/50 text-muted", view !== "month" && "min-h-64", dragId && "hover:bg-accent-soft/40")}
              >
                <div className={cx("mb-1 inline-grid h-6 min-w-6 place-items-center rounded-full px-1 text-[11px] font-semibold", today && "bg-accent text-accent-ink")}>{d.getDate()}</div>
                <div className="space-y-1">
                  {posts.map((p) => (
                    <Link
                      key={p.id}
                      href={`/content/posts/${p.id}`}
                      draggable
                      onDragStart={() => setDragId(p.id)}
                      className="flex items-center gap-1.5 rounded-lg border border-line bg-panel p-1 text-[11px] shadow-sm hover:border-accent"
                    >
                      {view !== "month" && <Thumb fileId={p.image_file_id} className="h-8 w-8 shrink-0 rounded" />}
                      <span className={cx("h-1.5 w-1.5 shrink-0 rounded-full", STATUS_DOT[p.status])} />
                      <span className="truncate">{p.title}</span>
                      {view !== "month" && (
                        <span className="ml-auto">
                          <PostStatus status={p.status} />
                        </span>
                      )}
                    </Link>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </Card>
    </div>
  );
}
